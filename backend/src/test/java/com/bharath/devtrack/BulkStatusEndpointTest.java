package com.bharath.devtrack;

import com.bharath.devtrack.application.*;
import com.bharath.devtrack.auth.UserAccount;
import com.bharath.devtrack.auth.UserAccountRepository;
import com.bharath.devtrack.interview.InterviewRoundRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import java.util.List;
import java.util.Map;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
        "spring.datasource.url=${TEST_DATABASE_URL:jdbc:h2:mem:bulkStatuses;DB_CLOSE_DELAY=-1}",
        "spring.datasource.driver-class-name=${TEST_DATABASE_DRIVER:org.h2.Driver}",
        "spring.datasource.username=${TEST_DATABASE_USER:sa}",
        "spring.datasource.password=${TEST_DATABASE_PASSWORD:}",
        "devtrack.auth.account-limit=1000", "devtrack.auth.registration-limit=1000",
        "devtrack.auth.login-limit=1000"
})
@AutoConfigureMockMvc
class BulkStatusEndpointTest {
    private static final String PASSWORD = "correct-horse-battery";
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserAccountRepository users;
    @Autowired JobApplicationRepository applications;
    @Autowired ApplicationActivityRepository activity;
    @Autowired InterviewRoundRepository interviews;
    @Autowired PasswordEncoder encoder;

    private UserAccount alice;
    private UserAccount bob;

    @BeforeEach
    void reset() {
        interviews.deleteAll();
        activity.deleteAll();
        applications.deleteAll();
        users.deleteAll();
        alice = users.save(new UserAccount("bulk-alice@example.com", encoder.encode(PASSWORD)));
        bob = users.save(new UserAccount("bulk-bob@example.com", encoder.encode(PASSWORD)));
    }

    @Test
    void changesAllSelectedApplicationsAndRecordsOnlyActualTransitions() throws Exception {
        long first = seed(alice, "Alpha", ApplicationStatus.SAVED);
        long second = seed(alice, "Beta", ApplicationStatus.SAVED);
        long unchanged = seed(alice, "Already Applied", ApplicationStatus.APPLIED);
        long other = seed(bob, "Other account", ApplicationStatus.SAVED);
        Session a = login(alice.getEmail());

        var request = patch("/api/applications/bulk/status").session(a.session())
                .header(a.header(), a.token()).contentType(MediaType.APPLICATION_JSON)
                .content(body(List.of(first, second, unchanged), "APPLIED"));
        mvc.perform(request).andExpect(status().isOk()).andExpect(jsonPath("$.updated").value(2));
        assertThat(applications.findById(first).orElseThrow().getStatus()).isEqualTo(ApplicationStatus.APPLIED);
        assertThat(applications.findById(second).orElseThrow().getStatus()).isEqualTo(ApplicationStatus.APPLIED);
        assertThat(applications.findById(unchanged).orElseThrow().getStatus()).isEqualTo(ApplicationStatus.APPLIED);
        assertThat(applications.findById(other).orElseThrow().getStatus()).isEqualTo(ApplicationStatus.SAVED);
        assertThat(activity.count()).isEqualTo(2);

        mvc.perform(patch("/api/applications/bulk/status").session(a.session())
                        .header(a.header(), a.token()).contentType(MediaType.APPLICATION_JSON)
                        .content(body(List.of(first, second), "APPLIED")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.updated").value(0));
        assertThat(activity.count()).isEqualTo(2);
    }

    @Test
    void rejectsInvalidOrForeignIdsWithoutAnyPartialChanges() throws Exception {
        long mine = seed(alice, "Safe", ApplicationStatus.SAVED);
        long foreign = seed(bob, "Private", ApplicationStatus.SAVED);
        Session a = login(alice.getEmail());
        mvc.perform(patch("/api/applications/bulk/status").session(a.session())
                        .header(a.header(), a.token()).contentType(MediaType.APPLICATION_JSON)
                        .content(body(List.of(mine, foreign), "INTERVIEW")))
                .andExpect(status().isNotFound());
        assertUnchanged(mine, foreign);
        mvc.perform(patch("/api/applications/bulk/status").session(a.session())
                        .header(a.header(), a.token()).contentType(MediaType.APPLICATION_JSON)
                        .content(body(List.of(mine, 987654321L), "APPLIED")))
                .andExpect(status().isNotFound());
        assertUnchanged(mine, foreign);
        mvc.perform(patch("/api/applications/bulk/status").session(a.session())
                        .header(a.header(), a.token()).contentType(MediaType.APPLICATION_JSON)
                        .content(body(List.of(mine, mine), "APPLIED")))
                .andExpect(status().isBadRequest());
        mvc.perform(patch("/api/applications/bulk/status").session(a.session())
                        .header(a.header(), a.token()).contentType(MediaType.APPLICATION_JSON)
                        .content(body(List.of(), "APPLIED")))
                .andExpect(status().isBadRequest());
        mvc.perform(patch("/api/applications/bulk/status").session(a.session())
                        .header(a.header(), a.token()).contentType(MediaType.APPLICATION_JSON)
                        .content(body(java.util.Collections.nCopies(101, mine), "APPLIED")))
                .andExpect(status().isBadRequest());
        assertUnchanged(mine, foreign);
        assertThat(activity.count()).isZero();
    }

    @Test
    void requiresAuthenticationAndCsrf() throws Exception {
        long mine = seed(alice, "Owned", ApplicationStatus.SAVED);
        Session a = login(alice.getEmail());
        String request = body(List.of(mine), "APPLIED");
        mvc.perform(patch("/api/applications/bulk/status")
                .contentType(MediaType.APPLICATION_JSON).content(request))
                .andExpect(status().isUnauthorized());
        mvc.perform(patch("/api/applications/bulk/status").session(a.session())
                .contentType(MediaType.APPLICATION_JSON).content(request))
                .andExpect(status().isForbidden());
        assertThat(applications.findById(mine).orElseThrow().getStatus()).isEqualTo(ApplicationStatus.SAVED);
    }

    private void assertUnchanged(long first, long second) {
        assertThat(applications.findById(first).orElseThrow().getStatus()).isEqualTo(ApplicationStatus.SAVED);
        assertThat(applications.findById(second).orElseThrow().getStatus()).isEqualTo(ApplicationStatus.SAVED);
    }

    private long seed(UserAccount owner, String company, ApplicationStatus status) {
        JobApplication application = new JobApplication();
        application.setOwner(owner);
        application.setCompany(company);
        application.setTitle("Engineer");
        application.setStatus(status);
        return applications.save(application).getId();
    }

    private String body(List<Long> ids, String status) throws Exception {
        return json.writeValueAsString(Map.of("ids", ids, "status", status));
    }

    private Session login(String email) throws Exception {
        MockHttpSession session = new MockHttpSession();
        JsonNode initial = json.readTree(mvc.perform(get("/api/auth/csrf").session(session))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        mvc.perform(post("/api/auth/login").session(session)
                .header(initial.get("headerName").asText(), initial.get("token").asText())
                .param("email", email).param("password", PASSWORD))
                .andExpect(status().isNoContent());
        JsonNode csrf = json.readTree(mvc.perform(get("/api/auth/csrf").session(session))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        return new Session(session, csrf.get("headerName").asText(), csrf.get("token").asText());
    }

    private record Session(MockHttpSession session, String header, String token) {}
}
