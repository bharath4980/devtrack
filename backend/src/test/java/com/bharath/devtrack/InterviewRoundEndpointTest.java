package com.bharath.devtrack;

import com.bharath.devtrack.application.JobApplication;
import com.bharath.devtrack.application.JobApplicationRepository;
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

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
        "spring.datasource.url=${TEST_DATABASE_URL:jdbc:h2:mem:interview;DB_CLOSE_DELAY=-1}",
        "spring.datasource.driver-class-name=${TEST_DATABASE_DRIVER:org.h2.Driver}",
        "spring.datasource.username=${TEST_DATABASE_USER:sa}",
        "spring.datasource.password=${TEST_DATABASE_PASSWORD:}",
        "devtrack.auth.account-limit=1000", "devtrack.auth.registration-limit=1000",
        "devtrack.auth.login-limit=1000"
})
@AutoConfigureMockMvc
class InterviewRoundEndpointTest {
    private static final String PASSWORD = "correct-horse-battery";
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserAccountRepository users;
    @Autowired JobApplicationRepository applications;
    @Autowired InterviewRoundRepository rounds;
    @Autowired PasswordEncoder encoder;

    private UserAccount alice;
    private UserAccount bob;

    @BeforeEach
    void setUp() {
        rounds.deleteAll();
        applications.deleteAll();
        users.deleteAll();
        alice = users.save(new UserAccount("alice@example.com", encoder.encode(PASSWORD)));
        bob = users.save(new UserAccount("bob@example.com", encoder.encode(PASSWORD)));
    }

    @Test
    void interviewRoundsArePrivateToTheirApplicationAndOwner() throws Exception {
        long ownId = seed(alice, "Owned role");
        long otherId = seed(bob, "Private role");
        long legacyId = seed(null, "Legacy role");
        SessionCredentials a = login(alice.getEmail());
        SessionCredentials b = login(bob.getEmail());

        mvc.perform(get("/api/applications/" + ownId + "/interviews")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/applications/" + ownId + "/interviews")
                .contentType(MediaType.APPLICATION_JSON).content(payload("Phone screen")))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/applications/" + ownId + "/interviews").session(a.session())
                .contentType(MediaType.APPLICATION_JSON).content(payload("Phone screen")))
                .andExpect(status().isForbidden());

        long roundId = json.readTree(mvc.perform(post("/api/applications/" + ownId + "/interviews")
                .session(a.session()).header(a.header(), a.token())
                .contentType(MediaType.APPLICATION_JSON).content(payload("Phone screen")))
                .andExpect(status().isCreated())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.roundName").value("Phone screen"))
                .andExpect(jsonPath("$.contactEmail").value("recruiter@example.com"))
                .andExpect(jsonPath("$.ownerId").doesNotExist())
                .andExpect(jsonPath("$.applicationId").doesNotExist())
                .andReturn().getResponse().getContentAsString()).get("id").asLong();

        mvc.perform(get("/api/applications/" + ownId + "/interviews").session(a.session()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(roundId));
        mvc.perform(get("/api/applications/" + ownId + "/interviews").session(b.session()))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/applications/" + otherId + "/interviews").session(a.session()))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/applications/" + legacyId + "/interviews").session(a.session()))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/applications/999999/interviews").session(a.session()))
                .andExpect(status().isNotFound());

        mvc.perform(put("/api/applications/" + ownId + "/interviews/" + roundId).session(b.session())
                .header(b.header(), b.token()).contentType(MediaType.APPLICATION_JSON)
                .content(payload("Stolen update")))
                .andExpect(status().isNotFound());
        mvc.perform(put("/api/applications/" + otherId + "/interviews/" + roundId).session(a.session())
                .header(a.header(), a.token()).contentType(MediaType.APPLICATION_JSON)
                .content(payload("Wrong application")))
                .andExpect(status().isNotFound());
        mvc.perform(delete("/api/applications/" + ownId + "/interviews/" + roundId).session(b.session())
                .header(b.header(), b.token())).andExpect(status().isNotFound());
        assertThat(rounds.count()).isEqualTo(1);
    }

    @Test
    void roundUpdatesPersistAndApplicationDeletionCascades() throws Exception {
        long applicationId = seed(alice, "Interview role");
        SessionCredentials a = login(alice.getEmail());
        long roundId = json.readTree(mvc.perform(post("/api/applications/" + applicationId + "/interviews")
                .session(a.session()).header(a.header(), a.token())
                .contentType(MediaType.APPLICATION_JSON).content(payload("First round")))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString())
                .get("id").asLong();

        String updated = json.writeValueAsString(Map.of(
                "roundName", "System design", "scheduledDate", "2026-11-04", "format", "ONSITE",
                "contactName", "Hiring manager", "contactEmail", "hiring@example.com",
                "preparationNotes", "Review caching", "followUpNotes", "Send thanks",
                "outcome", "COMPLETED"));
        mvc.perform(put("/api/applications/" + applicationId + "/interviews/" + roundId)
                .session(a.session()).header(a.header(), a.token())
                .contentType(MediaType.APPLICATION_JSON).content(updated))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.roundName").value("System design"))
                .andExpect(jsonPath("$.outcome").value("COMPLETED"))
                .andExpect(jsonPath("$.followUpNotes").value("Send thanks"));

        mvc.perform(get("/api/applications/" + applicationId + "/interviews").session(a.session()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].scheduledDate").value("2026-11-04"))
                .andExpect(jsonPath("$[0].preparationNotes").value("Review caching"));

        mvc.perform(delete("/api/applications/" + applicationId).session(a.session())
                .header(a.header(), a.token())).andExpect(status().isNoContent());
        assertThat(rounds.count()).isZero();
    }

    @Test
    void rejectsInvalidFieldsAndSupportsExplicitRoundDeletion() throws Exception {
        long applicationId = seed(alice, "Validation role");
        SessionCredentials a = login(alice.getEmail());
        String base = "/api/applications/" + applicationId + "/interviews";
        String invalid = json.writeValueAsString(Map.of(
                "roundName", "  ", "format", "VIDEO", "contactEmail", "not-an-email", "outcome", "PLANNED"));
        mvc.perform(post(base).session(a.session()).header(a.header(), a.token())
                .contentType(MediaType.APPLICATION_JSON).content(invalid))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.roundName").exists())
                .andExpect(jsonPath("$.fieldErrors.contactEmail").exists());
        mvc.perform(post(base).session(a.session()).header(a.header(), a.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"roundName\":\"Interview\",\"format\":\"UNKNOWN\",\"outcome\":\"PLANNED\"}"))
                .andExpect(status().isBadRequest());

        long roundId = json.readTree(mvc.perform(post(base).session(a.session())
                .header(a.header(), a.token()).contentType(MediaType.APPLICATION_JSON)
                .content(payload("Final screen"))).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString()).get("id").asLong();
        mvc.perform(delete(base + "/" + roundId).session(a.session())
                .header(a.header(), a.token())).andExpect(status().isNoContent());
        mvc.perform(get(base).session(a.session()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(delete(base + "/" + roundId).session(a.session())
                .header(a.header(), a.token())).andExpect(status().isNotFound());
    }

    private long seed(UserAccount owner, String company) {
        JobApplication application = new JobApplication();
        application.setOwner(owner);
        application.setCompany(company);
        application.setTitle("Engineer");
        return applications.save(application).getId();
    }

    private String payload(String name) throws Exception {
        return json.writeValueAsString(Map.of(
                "roundName", name, "scheduledDate", "2026-11-02", "format", "VIDEO",
                "contactName", "Recruiter", "contactEmail", "recruiter@example.com",
                "preparationNotes", "Review APIs", "followUpNotes", "Ask next steps",
                "outcome", "PLANNED"));
    }

    private SessionCredentials login(String email) throws Exception {
        MockHttpSession session = new MockHttpSession();
        JsonNode first = json.readTree(mvc.perform(get("/api/auth/csrf").session(session))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        mvc.perform(post("/api/auth/login").session(session)
                .header(first.get("headerName").asText(), first.get("token").asText())
                .param("email", email).param("password", PASSWORD))
                .andExpect(status().isNoContent());
        JsonNode refreshed = json.readTree(mvc.perform(get("/api/auth/csrf").session(session))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        return new SessionCredentials(session, refreshed.get("headerName").asText(),
                refreshed.get("token").asText());
    }

    private record SessionCredentials(MockHttpSession session, String header, String token) {}
}
