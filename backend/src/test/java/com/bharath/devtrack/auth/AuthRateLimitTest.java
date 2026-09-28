package com.bharath.devtrack.auth;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
    "spring.datasource.url=${TEST_DATABASE_URL:jdbc:h2:mem:ratelimits;DB_CLOSE_DELAY=-1}",
    "spring.datasource.driver-class-name=${TEST_DATABASE_DRIVER:org.h2.Driver}",
    "spring.datasource.username=${TEST_DATABASE_USER:sa}",
    "spring.datasource.password=${TEST_DATABASE_PASSWORD:}",
    "devtrack.auth.account-limit=1", "devtrack.auth.login-limit=3", "devtrack.auth.registration-limit=1"
})
@AutoConfigureMockMvc
class AuthRateLimitTest {
    @Autowired MockMvc mvc;

    @Test
    void limitsNormalizedAccountsAndGlobalAttemptsWithoutTrustingForwardedHeaders() throws Exception {
        mvc.perform(post("/api/auth/login").param("email", "nobody@example.com").param("password", "bad"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.status").value(403));
        mvc.perform(post("/api/auth/login").with(csrf()).param("email", "nobody@example.com").param("password", "bad"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.status").value(401));
        mvc.perform(post("/api/auth/login").with(csrf()).param("email", " NOBODY@EXAMPLE.COM ")
                        .param("password", "bad").header("X-Forwarded-For", "192.0.2.1"))
                .andExpect(status().isTooManyRequests()).andExpect(header().exists("Retry-After"))
                .andExpect(jsonPath("$.status").value(429));
        mvc.perform(post("/api/auth/login").with(csrf()).param("email", "other@example.com").param("password", "bad"))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/login").with(csrf()).param("email", "third@example.com").param("password", "bad"))
                .andExpect(status().isTooManyRequests());
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isTooManyRequests()).andExpect(jsonPath("$.path").value("/api/auth/register"));
        mvc.perform(get("/api/health")).andExpect(status().isOk());
    }
}
