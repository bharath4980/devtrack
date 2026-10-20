package com.bharath.devtrack;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.actuate.health.HealthContributorRegistry;
import org.springframework.boot.actuate.health.HealthEndpointGroups;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.security.test.context.support.WithMockUser;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        "spring.datasource.url=${TEST_DATABASE_URL:jdbc:h2:mem:healthcheck;DB_CLOSE_DELAY=-1}",
        "spring.datasource.driver-class-name=${TEST_DATABASE_DRIVER:org.h2.Driver}",
        "spring.datasource.username=${TEST_DATABASE_USER:sa}",
        "spring.datasource.password=${TEST_DATABASE_PASSWORD:}",
        "devtrack.auth.account-limit=1000",
        "devtrack.auth.registration-limit=1000",
        "devtrack.auth.login-limit=1000"
})
@AutoConfigureMockMvc
class HealthEndpointTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private HealthContributorRegistry contributors;

    @Autowired
    private HealthEndpointGroups endpointGroups;

    @Test
    void healthReportsUpWithoutExposingDetails() throws Exception {
        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"))
                .andExpect(jsonPath("$.components").doesNotExist())
                .andExpect(jsonPath("$.details").doesNotExist());
    }

    @Test
    void processLivenessIsAnonymousWithoutDatabaseHealthChecks() throws Exception {
        mockMvc.perform(get("/api/health/liveness"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"))
                .andExpect(jsonPath("$.components").doesNotExist())
                .andExpect(jsonPath("$.details").doesNotExist());

        // Liveness is intentionally process-only; /api/health retains database readiness.
        assertThat(endpointGroups.get("liveness")).isNotNull();
        assertThat(endpointGroups.get("liveness").getIncludes()).containsExactly("livenessState");
    }

    @Test
    void databaseIsPartOfHealthReadiness() {
        // /api/health must reflect critical database connectivity, not only an open port.
        assertThat(contributors.getContributor("db")).isNotNull();
    }

    @Test
    @WithMockUser
    void environmentEndpointIsNotExposed() throws Exception {
        mockMvc.perform(get("/api/env"))
                .andExpect(status().isNotFound());
    }
}
