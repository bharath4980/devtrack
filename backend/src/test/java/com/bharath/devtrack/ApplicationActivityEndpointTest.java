package com.bharath.devtrack;

import com.bharath.devtrack.application.ApplicationActivityRepository;
import com.bharath.devtrack.application.ApplicationStatus;
import com.bharath.devtrack.application.JobApplication;
import com.bharath.devtrack.application.JobApplicationRepository;
import com.bharath.devtrack.auth.UserAccount;
import com.bharath.devtrack.auth.UserAccountRepository;
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

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
        "spring.datasource.url=${TEST_DATABASE_URL:jdbc:h2:mem:activity;DB_CLOSE_DELAY=-1}",
        "spring.datasource.driver-class-name=${TEST_DATABASE_DRIVER:org.h2.Driver}",
        "spring.datasource.username=${TEST_DATABASE_USER:sa}",
        "spring.datasource.password=${TEST_DATABASE_PASSWORD:}",
        "devtrack.auth.account-limit=1000", "devtrack.auth.registration-limit=1000",
        "devtrack.auth.login-limit=1000"
})
@AutoConfigureMockMvc
class ApplicationActivityEndpointTest {
    private static final String PASSWORD = "correct-horse-battery";
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserAccountRepository users;
    @Autowired JobApplicationRepository applications;
    @Autowired ApplicationActivityRepository activity;
    @Autowired PasswordEncoder encoder;

    private UserAccount alice;
    private UserAccount bob;

    @BeforeEach
    void setUp() {
        applications.deleteAll();
        users.deleteAll();
        alice = users.save(new UserAccount("alice@example.com", encoder.encode(PASSWORD)));
        bob = users.save(new UserAccount("bob@example.com", encoder.encode(PASSWORD)));
    }

    @Test
    void activityEndpointsRequireSignInAndHideOtherAccounts() throws Exception {
        mvc.perform(get("/api/dashboard/activity")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/dashboard/analytics")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/applications/1/activity")).andExpect(status().isUnauthorized());

        SessionCredentials a = login(alice.getEmail());
        long id = create(a, "Alice Opportunity");
        SessionCredentials b = login(bob.getEmail());
        mvc.perform(get("/api/applications/" + id + "/activity").session(b.session()))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/dashboard/activity").session(b.session()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/dashboard/analytics").session(b.session()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.trackedApplications").value(0))
                .andExpect(jsonPath("$.interviewOrOfferRate").value(0))
                .andExpect(jsonPath("$.monthlyApplications.length()").value(6));

        assertThat(activity.count()).isEqualTo(1);
    }

    @Test
    void creationAndMeaningfulChangesProduceChronologicalHistoryAndAnalytics() throws Exception {
        SessionCredentials a = login(alice.getEmail());
        long id = create(a, "Progress Corp");
        changeStatus(a, id, "INTERVIEW");
        changeStatus(a, id, "INTERVIEW");
        changeStatus(a, id, "REJECTED");

        mvc.perform(get("/api/applications/" + id + "/activity").session(a.session()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].type").value("STATUS_CHANGED"))
                .andExpect(jsonPath("$[0].fromStatus").value("INTERVIEW"))
                .andExpect(jsonPath("$[0].toStatus").value("REJECTED"))
                .andExpect(jsonPath("$[1].fromStatus").value("SAVED"))
                .andExpect(jsonPath("$[1].toStatus").value("INTERVIEW"))
                .andExpect(jsonPath("$[2].type").value("CREATED"))
                .andExpect(jsonPath("$[2].fromStatus").doesNotExist())
                .andExpect(jsonPath("$[2].toStatus").value("SAVED"));

        mvc.perform(get("/api/dashboard/activity").session(a.session()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].company").value("Progress Corp"));

        mvc.perform(get("/api/dashboard/analytics").session(a.session()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.trackedApplications").value(1))
                .andExpect(jsonPath("$.interviewOrOfferReached").value(1))
                .andExpect(jsonPath("$.offersReached").value(0))
                .andExpect(jsonPath("$.interviewOrOfferRate").value(100.0))
                .andExpect(jsonPath("$.offerRate").value(0.0))
                .andExpect(jsonPath("$.monthlyApplications.length()").value(6));

        mvc.perform(delete("/api/applications/" + id).session(a.session())
                        .header(a.header(), a.token())).andExpect(status().isNoContent());
        mvc.perform(get("/api/dashboard/activity").session(a.session()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        assertThat(activity.count()).isZero();
    }

    @Test
    void completingFollowUpIsOwnerScopedCsrfProtectedAndRecordedOnce() throws Exception {
        SessionCredentials a = login(alice.getEmail());
        SessionCredentials b = login(bob.getEmail());
        long id = create(a, "Reminder Studio");
        LocalDate yesterday = LocalDate.now(ZoneOffset.UTC).minusDays(1);

        mvc.perform(patch("/api/applications/" + id + "/follow-up").session(a.session())
                .header(a.header(), a.token()).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("followUpDate", yesterday.toString()))))
                .andExpect(status().isOk());

        mvc.perform(get("/api/dashboard").session(a.session()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.overdueFollowUps").value(1));
        mvc.perform(patch("/api/applications/" + id + "/follow-up/complete")
                .session(a.session()))
                .andExpect(status().isForbidden());
        mvc.perform(patch("/api/applications/" + id + "/follow-up/complete")
                .session(b.session()).header(b.header(), b.token()))
                .andExpect(status().isNotFound());

        mvc.perform(patch("/api/applications/" + id + "/follow-up/complete")
                .session(a.session()).header(a.header(), a.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SAVED"))
                .andExpect(jsonPath("$.followUpDate").isEmpty());

        mvc.perform(get("/api/dashboard").session(a.session()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.overdueFollowUps").value(0))
                .andExpect(jsonPath("$.dueTodayFollowUps").value(0));
        mvc.perform(get("/api/dashboard/follow-ups").session(a.session()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/applications/" + id + "/activity").session(a.session()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].type").value("FOLLOW_UP_COMPLETED"))
                .andExpect(jsonPath("$[0].toStatus").value("SAVED"))
                .andExpect(jsonPath("$[0].fromStatus").isEmpty())
                .andExpect(jsonPath("$[1].type").value("CREATED"));

        mvc.perform(patch("/api/applications/" + id + "/follow-up/complete")
                .session(a.session()).header(a.header(), a.token()))
                .andExpect(status().isConflict());
        assertThat(activity.count()).isEqualTo(2);
        mvc.perform(get("/api/dashboard/activity").session(b.session()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void oldRowsHaveNoInventedHistoryButCurrentStagesCountForAnalytics() throws Exception {
        JobApplication earlier = new JobApplication();
        earlier.setOwner(alice);
        earlier.setCompany("Existing Company");
        earlier.setTitle("Engineer");
        earlier.setStatus(ApplicationStatus.OFFER);
        earlier.setApplicationDate(LocalDate.now(ZoneOffset.UTC));
        long id = applications.save(earlier).getId();

        SessionCredentials a = login(alice.getEmail());
        mvc.perform(get("/api/applications/" + id + "/activity").session(a.session()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/dashboard/analytics").session(a.session()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.interviewOrOfferReached").value(1))
                .andExpect(jsonPath("$.offersReached").value(1))
                .andExpect(jsonPath("$.offerRate").value(100.0));
    }

    private long create(SessionCredentials user, String company) throws Exception {
        String payload = json.writeValueAsString(Map.of(
                "company", company, "title", "Software Engineer",
                "applicationDate", LocalDate.now(ZoneOffset.UTC).toString()));
        var response = mvc.perform(post("/api/applications").session(user.session())
                        .header(user.header(), user.token()).contentType(MediaType.APPLICATION_JSON)
                        .content(payload)).andExpect(status().isCreated()).andReturn();
        return json.readTree(response.getResponse().getContentAsString()).get("id").asLong();
    }

    private void changeStatus(SessionCredentials user, long id, String status) throws Exception {
        mvc.perform(patch("/api/applications/" + id + "/status").session(user.session())
                        .header(user.header(), user.token()).contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("status", status))))
                .andExpect(status().isOk());
    }

    private SessionCredentials login(String email) throws Exception {
        MockHttpSession session = new MockHttpSession();
        var response = mvc.perform(get("/api/auth/csrf").session(session))
                .andExpect(status().isOk()).andReturn();
        JsonNode csrf = json.readTree(response.getResponse().getContentAsString());
        String header = csrf.get("headerName").asText();
        String token = csrf.get("token").asText();
        mvc.perform(post("/api/auth/login").session(session).header(header, token)
                        .param("email", email).param("password", PASSWORD))
                .andExpect(status().isNoContent());
        // The token rotates when authentication succeeds.
        var rotated = mvc.perform(get("/api/auth/csrf").session(session))
                .andExpect(status().isOk()).andReturn();
        JsonNode refreshed = json.readTree(rotated.getResponse().getContentAsString());
        return new SessionCredentials(session, refreshed.get("headerName").asText(),
                refreshed.get("token").asText());
    }

    private record SessionCredentials(MockHttpSession session, String header, String token) {}
}
