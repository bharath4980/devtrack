package com.bharath.devtrack.auth;

import com.bharath.devtrack.error.ApiErrorWriter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.util.HexFormat;
import java.util.Locale;

public class AuthRateLimitFilter extends OncePerRequestFilter {
    private final FixedWindowRateLimiter accounts;
    private final FixedWindowRateLimiter logins;
    private final FixedWindowRateLimiter registrations;
    private final ApiErrorWriter errors;

    public AuthRateLimitFilter(ApiErrorWriter errors, int accountLimit, int loginLimit, int registrationLimit) {
        Clock clock = Clock.systemUTC();
        this.errors = errors;
        accounts = new FixedWindowRateLimiter(accountLimit, Duration.ofMinutes(15), 10_000, clock);
        logins = new FixedWindowRateLimiter(loginLimit, Duration.ofMinutes(1), 1, clock);
        registrations = new FixedWindowRateLimiter(registrationLimit, Duration.ofHours(1), 1, clock);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String path = request.getServletPath();
        if (path.isEmpty()) path = request.getRequestURI().substring(request.getContextPath().length());
        if ("POST".equals(request.getMethod())) {
            long retry = 0;
            if ("/api/auth/login".equals(path)) {
                retry = logins.acquire("login");
                if (retry == 0) {
                    String email = request.getParameter("email");
                    if (email == null || email.length() > 254) {
                        errors.write(request, response, HttpStatus.UNAUTHORIZED, "Email or password is incorrect.");
                        return;
                    }
                    retry = accounts.acquire(accountKey(email));
                }
            } else if ("/api/auth/register".equals(path)) {
                retry = registrations.acquire("register");
            }
            if (retry > 0) {
                response.setHeader("Retry-After", Long.toString(retry));
                errors.write(request, response, HttpStatus.TOO_MANY_REQUESTS,
                        "Too many attempts. Please wait before trying again.");
                return;
            }
        }
        chain.doFilter(request, response);
    }

    private String accountKey(String email) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(
                    email.trim().toLowerCase(Locale.ROOT).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is required by Java", exception);
        }
    }
}
