package com.bharath.devtrack.config;

import jakarta.servlet.DispatcherType;
import com.bharath.devtrack.auth.AuthRateLimitFilter;
import com.bharath.devtrack.error.ApiErrorWriter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class SecurityConfig {

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, ApiErrorWriter errors,
            @Value("${devtrack.auth.account-limit:10}") int accountLimit,
            @Value("${devtrack.auth.login-limit:100}") int loginLimit,
            @Value("${devtrack.auth.registration-limit:20}") int registrationLimit)
            throws Exception {

        return http
                .csrf(Customizer.withDefaults())
                .addFilterAfter(new AuthRateLimitFilter(errors, accountLimit, loginLimit, registrationLimit), CsrfFilter.class)
                .headers(headers -> headers.contentSecurityPolicy(policy -> policy.policyDirectives(
                        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
                        + "connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'")))
                .authorizeHttpRequests(authorize -> authorize
                        .dispatcherTypeMatchers(DispatcherType.ERROR)
                        .permitAll()
                        .requestMatchers(
                                HttpMethod.GET,
                                "/",
                                "/index.html",
                                "/assets/**",
                                "/favicon.ico"
                        )
                        .permitAll()
                        .requestMatchers(
                                HttpMethod.GET,
                                "/api/health",
                                "/api/auth/csrf"
                        )
                        .permitAll()
                        .requestMatchers(
                                HttpMethod.POST,
                                "/api/auth/register",
                                "/api/auth/login"
                        )
                        .permitAll()
                        .anyRequest()
                        .authenticated()
                )
                .requestCache(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(login -> login
                        .loginProcessingUrl("/api/auth/login")
                        .usernameParameter("email")
                        .successHandler(
                                (request, response, authentication) ->
                                        response.setStatus(204)
                        )
                        .failureHandler(
                                (request, response, exception) ->
                                        errors.write(request, response, HttpStatus.UNAUTHORIZED, "Email or password is incorrect.")
                        )
                        .permitAll()
                )
                .logout(logout -> logout
                        .logoutUrl("/api/auth/logout")
                        .invalidateHttpSession(true)
                        .clearAuthentication(true)
                        .deleteCookies("JSESSIONID")
                        .logoutSuccessHandler(
                                (request, response, authentication) ->
                                        response.setStatus(204)
                        )
                )
                .exceptionHandling(handling -> handling
                        .authenticationEntryPoint(
                                (request, response, exception) ->
                                        errors.write(request, response, HttpStatus.UNAUTHORIZED, "Sign in to continue.")
                        )
                        .accessDeniedHandler(
                                (request, response, exception) ->
                                        errors.write(request, response, HttpStatus.FORBIDDEN, "Request could not be verified. Refresh the page and try again.")
                        )
                )
                .build();
    }
}