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
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
        "spring.datasource.url=${TEST_DATABASE_URL:jdbc:h2:mem:applicationImport;DB_CLOSE_DELAY=-1}",
        "spring.datasource.driver-class-name=${TEST_DATABASE_DRIVER:org.h2.Driver}",
        "spring.datasource.username=${TEST_DATABASE_USER:sa}",
        "spring.datasource.password=${TEST_DATABASE_PASSWORD:}",
        "devtrack.auth.account-limit=1000", "devtrack.auth.registration-limit=1000",
        "devtrack.auth.login-limit=1000"
})
@AutoConfigureMockMvc
class ApplicationImportEndpointTest {
    private static final String PASSWORD = "correct-horse-battery";
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserAccountRepository users;
    @Autowired JobApplicationRepository applications;
    @Autowired ApplicationActivityRepository activities;
    @Autowired InterviewRoundRepository interviews;
    @Autowired PasswordEncoder encoder;

    UserAccount alice;
    UserAccount bob;

    @BeforeEach
    void setUp() {
        interviews.deleteAll();
        activities.deleteAll();
        applications.deleteAll();
        users.deleteAll();
        alice = users.save(new UserAccount("alice@example.com", encoder.encode(PASSWORD)));
        bob = users.save(new UserAccount("bob@example.com", encoder.encode(PASSWORD)));
    }

    @Test
    void importRequiresAuthenticationAndCsrfAndPreservesOwnerIsolation() throws Exception {
        SessionCredentials a = login(alice.getEmail());
        SessionCredentials b = login(bob.getEmail());
        String body = batch(List.of(row("New Role", "Backend Engineer", "https://jobs.example.com/new",
                "INTERVIEW", "2026-10-01")));

        mvc.perform(post("/api/applications/import").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/applications/import").session(a.session())
                .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
        mvc.perform(post("/api/applications/import").session(a.session())
                .header(a.header(), a.token()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.imported").value(1))
                .andExpect(header().string("Cache-Control", "no-store"));
        mvc.perform(get("/api/applications").session(a.session()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.items[0].status").value("INTERVIEW"))
                .andExpect(jsonPath("$.items[0].applicationDate").value("2026-10-01"));
        mvc.perform(get("/api/applications").session(b.session()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0));
        assertThat(activities.count()).isEqualTo(1);
        assertThat(activities.findTop12ByOwner_IdOrderByOccurredAtDescIdDesc(alice.getId()).get(0)
                .getToStatus()).isEqualTo(ApplicationStatus.INTERVIEW);
    }

    @Test
    void invalidSecondRowRejectsWholeBatchWithoutWriting() throws Exception {
        SessionCredentials a = login(alice.getEmail());
        String body = batch(List.of(
                row("Valid role", "Engineer", "", "APPLIED", "2026-10-01"),
                row("Invalid", "Engineer", "", "OFFER", "not-a-date")));
        mvc.perform(post("/api/applications/import").session(a.session()).header(a.header(), a.token())
                .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("Row 2")));
        assertThat(applications.count()).isZero();
        assertThat(activities.count()).isZero();

        String invalidStatus = batch(List.of(row("Invalid", "Engineer", "", "UNKNOWN", "2026-10-01")));
        mvc.perform(post("/api/applications/import").session(a.session()).header(a.header(), a.token())
                .contentType(MediaType.APPLICATION_JSON).content(invalidStatus))
                .andExpect(status().isBadRequest());
        assertThat(applications.count()).isZero();
    }

    @Test
    void duplicatePostingUrlsAreRejectedAcrossTrackingLinksAndWithinBatch() throws Exception {
        JobApplication owned = new JobApplication();
        owned.setOwner(alice);
        owned.setCompany("Existing");
        owned.setTitle("Engineer");
        owned.setPostingUrl("https://jobs.lever.co/example/abc?source=old");
        applications.save(owned);
        SessionCredentials a = login(alice.getEmail());
        String conflict = batch(List.of(row("Existing again", "Engineer",
                "https://jobs.lever.co/example/abc?utm_source=other", "SAVED", "")));
        mvc.perform(post("/api/applications/import").session(a.session()).header(a.header(), a.token())
                .contentType(MediaType.APPLICATION_JSON).content(conflict))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("Row 1")));
        assertThat(applications.count()).isEqualTo(1);

        String duplicateFile = batch(List.of(
                row("A", "Engineer", "https://jobs.lever.co/example/new?source=abc", "SAVED", ""),
                row("B", "Engineer", "https://jobs.lever.co/example/new?utm_source=def", "APPLIED", "")));
        mvc.perform(post("/api/applications/import").session(a.session()).header(a.header(), a.token())
                .contentType(MediaType.APPLICATION_JSON).content(duplicateFile))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("Row 2")));
        assertThat(applications.count()).isEqualTo(1);
        assertThat(activities.count()).isZero();
    }

    @Test
    void duplicateManualApplicationAndOversizedBatchAreRejected() throws Exception {
        JobApplication owned = new JobApplication();
        owned.setOwner(alice);
        owned.setCompany("Acme");
        owned.setTitle("Engineer");
        owned.setApplicationDate(LocalDate.parse("2026-10-01"));
        applications.save(owned);
        SessionCredentials a = login(alice.getEmail());
        mvc.perform(post("/api/applications/import").session(a.session()).header(a.header(), a.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content(batch(List.of(row("acme", "ENGINEER", "", "APPLIED", "2026-10-01")))))
                .andExpect(status().isBadRequest());
        var items = java.util.Collections.nCopies(101,
                row("New", "Engineer", "", "SAVED", "2026-10-01"));
        mvc.perform(post("/api/applications/import").session(a.session()).header(a.header(), a.token())
                .contentType(MediaType.APPLICATION_JSON).content(batch(items)))
                .andExpect(status().isBadRequest());
        assertThat(applications.count()).isEqualTo(1);
    }

    @Test
    void importedDataRoundTripsThroughExistingCsvExportAndNeverUsesSourceIds() throws Exception {
        SessionCredentials a = login(alice.getEmail());
        Map<String, String> row = new java.util.LinkedHashMap<>(row(
                "Commas, Quotes", "API \"Engineer\"", "", "OFFER", "2026-09-30"));
        row.put("location", "New York, NY");
        row.put("notes", "First line\nSecond line");
        row.put("interviewDate", "2026-10-03");
        row.put("followUpDate", "2026-10-04");
        row.put("recruiterName", "Taylor Morgan");
        row.put("recruiterEmail", "taylor@example.com");
        row.put("resumeVersion", "Java backend v2");
        mvc.perform(post("/api/applications/import").session(a.session()).header(a.header(), a.token())
                .contentType(MediaType.APPLICATION_JSON).content(batch(List.of(row))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.imported").value(1));
        String csv = mvc.perform(get("/api/applications/export.csv").session(a.session()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(csv).contains("Commas, Quotes", "API \"\"Engineer\"\"", "New York, NY",
                "OFFER", "2026-10-03", "2026-10-04", "First line\nSecond line",
                "Taylor Morgan", "taylor@example.com", "Java backend v2");
        assertThat(activities.count()).isEqualTo(1);
    }

    @Test
    void invalidRecruiterEmailRejectsCsvWithoutWriting() throws Exception {
        SessionCredentials a = login(alice.getEmail());
        Map<String, String> invalid = new java.util.LinkedHashMap<>(
                row("Invalid Contact", "Engineer", "", "SAVED", "2026-10-01"));
        invalid.put("recruiterEmail", "not-an-email");
        mvc.perform(post("/api/applications/import").session(a.session())
                        .header(a.header(), a.token()).contentType(MediaType.APPLICATION_JSON)
                        .content(batch(List.of(invalid))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("recruiter email")));
        assertThat(applications.count()).isZero();
    }

    private Map<String, String> row(String company, String title, String url, String status, String date) {
        return Map.of("company", company, "title", title, "postingUrl", url,
                "status", status, "applicationDate", date);
    }

    private String batch(List<? extends Map<String, String>> rows) throws Exception {
        return json.writeValueAsString(Map.of("rows", rows));
    }

    private SessionCredentials login(String email) throws Exception {
        MockHttpSession session = new MockHttpSession();
        JsonNode first = json.readTree(mvc.perform(get("/api/auth/csrf").session(session))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        mvc.perform(post("/api/auth/login").session(session)
                .header(first.get("headerName").asText(), first.get("token").asText())
                .param("email", email).param("password", PASSWORD)).andExpect(status().isNoContent());
        JsonNode token = json.readTree(mvc.perform(get("/api/auth/csrf").session(session))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        return new SessionCredentials(session, token.get("headerName").asText(), token.get("token").asText());
    }
    private record SessionCredentials(MockHttpSession session, String header, String token) {}
}
