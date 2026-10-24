package com.bharath.devtrack;

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
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
        "spring.datasource.url=${TEST_DATABASE_URL:jdbc:h2:mem:ownership;DB_CLOSE_DELAY=-1}",
        "spring.datasource.driver-class-name=${TEST_DATABASE_DRIVER:org.h2.Driver}",
        "spring.datasource.username=${TEST_DATABASE_USER:sa}",
        "spring.datasource.password=${TEST_DATABASE_PASSWORD:}",
        "devtrack.auth.account-limit=1000",
        "devtrack.auth.registration-limit=1000",
        "devtrack.auth.login-limit=1000"
})
@AutoConfigureMockMvc
class AuthOwnershipTest {
    private static final String PASSWORD = "correct-horse-battery";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserAccountRepository users;
    @Autowired JobApplicationRepository applications;
    @Autowired PasswordEncoder encoder;

    UserAccount alice;
    UserAccount bob;

    @BeforeEach
    void setUp() {
        applications.deleteAll();
        users.deleteAll();
        alice = users.save(new UserAccount("alice@example.com", encoder.encode(PASSWORD)));
        bob = users.save(new UserAccount("bob@example.com", encoder.encode(PASSWORD)));
    }

    @Test
    void applicationDetailLookupRequiresAuthenticationAndOwnership() throws Exception {
        JobApplication mine = seed(alice, "Owned Detail");
        JobApplication other = seed(bob, "Private Detail");
        JobApplication legacy = seed(null, "Legacy Detail");

        mvc.perform(get("/api/applications/" + mine.getId()))
                .andExpect(status().isUnauthorized());
        MockHttpSession aliceSession = login(alice.getEmail());
        mvc.perform(get("/api/applications/" + mine.getId()).session(aliceSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(mine.getId()))
                .andExpect(jsonPath("$.company").value("Owned Detail"))
                .andExpect(jsonPath("$.location").value("Houston"));
        mvc.perform(get("/api/applications/" + other.getId()).session(aliceSession))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/applications/" + legacy.getId()).session(aliceSession))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/applications/999999999").session(aliceSession))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/applications/" + other.getId()).session(login(bob.getEmail())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.company").value("Private Detail"));
    }

    @Test
    void recruiterAndResumeDetailsRemainOwnedAndEditable() throws Exception {
        MockHttpSession aliceSession = login(alice.getEmail());
        Csrf aliceCsrf = csrf(aliceSession);
        var payload = (com.fasterxml.jackson.databind.node.ObjectNode) json.readTree(applicationBody());
        payload.put("recruiterName", "  Jordan Lee  ");
        payload.put("recruiterEmail", "jordan@example.com");
        payload.put("resumeVersion", "Backend resume v3");

        MvcResult created = mvc.perform(post("/api/applications").session(aliceSession)
                        .header(aliceCsrf.header(), aliceCsrf.token())
                        .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(payload)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.recruiterName").value("Jordan Lee"))
                .andExpect(jsonPath("$.recruiterEmail").value("jordan@example.com"))
                .andExpect(jsonPath("$.resumeVersion").value("Backend resume v3"))
                .andReturn();
        long id = json.readTree(created.getResponse().getContentAsString()).get("id").asLong();
        mvc.perform(get("/api/applications/" + id).session(login(bob.getEmail())))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/applications/" + id).session(aliceSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.resumeVersion").value("Backend resume v3"));

        payload.put("recruiterName", "Casey Smith");
        payload.put("resumeVersion", "Full stack v2");
        mvc.perform(put("/api/applications/" + id).session(aliceSession)
                        .header(aliceCsrf.header(), aliceCsrf.token())
                        .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(payload)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.recruiterName").value("Casey Smith"))
                .andExpect(jsonPath("$.resumeVersion").value("Full stack v2"));

        String csv = mvc.perform(get("/api/applications/export.csv").session(aliceSession))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(csv).contains("Casey Smith", "jordan@example.com", "Full stack v2");

        payload.put("recruiterEmail", "invalid-email");
        mvc.perform(put("/api/applications/" + id).session(aliceSession)
                        .header(aliceCsrf.header(), aliceCsrf.token())
                        .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(payload)))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/applications/" + id).session(aliceSession))
                .andExpect(jsonPath("$.recruiterEmail").value("jordan@example.com"));
    }

    @Test
    void csvExportRequiresAuthenticationAndOnlyReturnsAllOwnedRows() throws Exception {
        mvc.perform(get("/api/applications/export.csv")).andExpect(status().isUnauthorized());

        for (int i = 0; i < 12; i++) {
            seed(alice, "Owned " + i);
        }
        seed(bob, "Someone Else");
        seed(null, "Unassigned Legacy");
        long recordsBefore = applications.count();

        MvcResult result = mvc.perform(get("/api/applications/export.csv")
                        .session(login(alice.getEmail())))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "text/csv;charset=UTF-8"))
                .andExpect(header().string("Content-Disposition",
                        "attachment; filename=\"devtrack-applications.csv\""))
                .andExpect(header().string("Cache-Control", "no-store"))
                .andReturn();
        String csv = new String(result.getResponse().getContentAsByteArray(), StandardCharsets.UTF_8);
        assertThat(csv).startsWith("\uFEFFid,company,title,location,status,application_date,interview_date,follow_up_date,posting_url,notes,recruiter_name,recruiter_email,resume_version\r\n");
        assertThat(csv.split("\r\n")).hasSize(13);
        assertThat(csv).contains("Owned 0", "Owned 11");
        assertThat(csv).doesNotContain("Someone Else", "Unassigned Legacy", "alice@example.com");
        assertThat(applications.count()).isEqualTo(recordsBefore);
    }

    @Test
    void csvExportPreservesQuotesCommasUnicodeAndNewlinesAndNeutralizesFormulas() throws Exception {
        JobApplication unsafe = seed(alice, "=1+1");
        unsafe.setTitle("=SUM(2,2)");
        unsafe.setLocation("Austin, \"TX\"");
        unsafe.setNotes("Line 1\nLine 2, \"quoted\"");
        unsafe.setPostingUrl("https://example.com/jobs/123?tag=a,b");
        unsafe.setApplicationDate(java.time.LocalDate.of(2026, 10, 19));
        unsafe.setFollowUpDate(java.time.LocalDate.of(2026, 10, 24));
        applications.save(unsafe);
        JobApplication second = seed(alice, "Café ☕");
        second.setNotes("  +IMPORT(1)");
        applications.save(second);
        long before = applications.count();

        MvcResult result = mvc.perform(get("/api/applications/export.csv")
                        .session(login(alice.getEmail())))
                .andExpect(status().isOk()).andReturn();
        String csv = new String(result.getResponse().getContentAsByteArray(), StandardCharsets.UTF_8);
        assertThat(csv).contains("\"'=1+1\"", "\"'=SUM(2,2)\"",
                "\"Austin, \"\"TX\"\"\"", "\"Line 1\nLine 2, \"\"quoted\"\"\"",
                "\"https://example.com/jobs/123?tag=a,b\"", "\"2026-10-19\"",
                "\"2026-10-24\"", "\"'  +IMPORT(1)\"", "Café ☕");
        assertThat(applications.count()).isEqualTo(before);
    }

    @Test
    void emptyAccountExportsHeaderOnly() throws Exception {
        MvcResult result = mvc.perform(get("/api/applications/export.csv")
                        .session(login(alice.getEmail())))
                .andExpect(status().isOk()).andReturn();
        String csv = new String(result.getResponse().getContentAsByteArray(), StandardCharsets.UTF_8);
        assertThat(csv.split("\r\n")).hasSize(1);
        assertThat(csv).startsWith("\uFEFFid,company,title,location");
    }

    @Test
    void registrationNormalizesEmailHashesPasswordAndRejectsDuplicates() throws Exception {
        Csrf csrf = csrf(new MockHttpSession());
        String body = json.writeValueAsString(Map.of(
                "email", "  NEW@Example.com ", "password", PASSWORD));
        mvc.perform(post("/api/auth/register").session(csrf.session())
                        .header(csrf.header(), csrf.token())
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.email").value("new@example.com"))
                .andExpect(jsonPath("$.passwordHash").doesNotExist())
                .andExpect(jsonPath("$.password").doesNotExist());

        UserAccount saved = users.findByEmail("new@example.com").orElseThrow();
        assertThat(saved.getPasswordHash()).isNotEqualTo(PASSWORD);
        assertThat(encoder.matches(PASSWORD, saved.getPasswordHash())).isTrue();

        mvc.perform(post("/api/auth/register").session(csrf.session())
                        .header(csrf.header(), csrf.token())
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict());
    }

    @Test
    void registrationValidatesEmailAndPasswordIncludingBcryptByteLimit() throws Exception {
        Csrf csrf = csrf(new MockHttpSession());
        for (Map<String, String> input : java.util.List.of(
                Map.of("email", "not-an-email", "password", PASSWORD),
                Map.of("email", "new@example.com", "password", "short"),
                Map.of("email", "new@example.com", "password", "é".repeat(40)))) {
            mvc.perform(post("/api/auth/register").session(csrf.session())
                            .header(csrf.header(), csrf.token())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(input)))
                    .andExpect(status().isBadRequest());
        }
        assertThat(users.count()).isEqualTo(2);
    }

    @Test
    void loginPersistsAuthenticationAndRotatesTheSessionAndCsrfToken() throws Exception {
        Csrf before = csrf(new MockHttpSession());
        String oldSessionId = before.session().getId();
        mvc.perform(post("/api/auth/login").session(before.session())
                        .header(before.header(), before.token())
                        .param("email", " ALICE@EXAMPLE.COM ").param("password", PASSWORD))
                .andExpect(status().isNoContent());
        assertThat(before.session().getId()).isNotEqualTo(oldSessionId);

        mvc.perform(get("/api/auth/me").session(before.session()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(alice.getId()))
                .andExpect(jsonPath("$.email").value(alice.getEmail()))
                .andExpect(jsonPath("$.passwordHash").doesNotExist());

        mvc.perform(post("/api/applications").session(before.session())
                        .header(before.header(), before.token())
                        .contentType(MediaType.APPLICATION_JSON).content(applicationBody()))
                .andExpect(status().isForbidden());

        Csrf refreshed = csrf(before.session());
        mvc.perform(post("/api/applications").session(refreshed.session())
                        .header(refreshed.header(), refreshed.token())
                        .contentType(MediaType.APPLICATION_JSON).content(applicationBody()))
                .andExpect(status().isCreated());
    }

    @Test
    void failedLoginDoesNotAuthenticateOrRevealWhetherEmailExists() throws Exception {
        for (String email : java.util.List.of("alice@example.com", "unknown@example.com")) {
            Csrf csrf = csrf(new MockHttpSession());
            mvc.perform(post("/api/auth/login").session(csrf.session())
                            .header(csrf.header(), csrf.token())
                            .param("email", email).param("password", "wrong-password"))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.message").value("Email or password is incorrect."));
            mvc.perform(get("/api/auth/me").session(csrf.session()))
                    .andExpect(status().isUnauthorized());
        }
    }

    @Test
    void authenticationAndCsrfAreRequired() throws Exception {
        mvc.perform(get("/api/applications")).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401));
        mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/login").param("email", alice.getEmail())
                        .param("password", PASSWORD)).andExpect(status().isForbidden());
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content("{}")).andExpect(status().isForbidden());

        Csrf anonymous = csrf(new MockHttpSession());
        mvc.perform(post("/api/applications").session(anonymous.session())
                        .header(anonymous.header(), anonymous.token())
                        .contentType(MediaType.APPLICATION_JSON).content(applicationBody()))
                .andExpect(status().isUnauthorized());

        MockHttpSession session = login(alice.getEmail());
        mvc.perform(post("/api/applications").session(session)
                        .contentType(MediaType.APPLICATION_JSON).content(applicationBody()))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/auth/logout").session(session)).andExpect(status().isForbidden());
    }

    @Test
    void createAlwaysUsesSignedInOwnerAndKeepsValidation() throws Exception {
        MockHttpSession session = login(alice.getEmail());
        Csrf csrf = csrf(session);
        String body = applicationBody().replace("\"company\":", "\"ownerId\":" + bob.getId() + ",\"company\":");
        MvcResult result = mvc.perform(post("/api/applications").session(session)
                        .header(csrf.header(), csrf.token())
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("SAVED"))
                .andExpect(jsonPath("$.owner").doesNotExist())
                .andReturn();
        long id = json.readTree(result.getResponse().getContentAsString()).get("id").asLong();
        assertThat(applications.findByIdAndOwner_Id(id, alice.getId())).isPresent();
        assertThat(applications.findByIdAndOwner_Id(id, bob.getId())).isEmpty();

        mvc.perform(post("/api/applications").session(session)
                        .header(csrf.header(), csrf.token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(applicationBody().replace("Acme", " ")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void duplicateLookupOnlyRevealsOwnSavedPostingAndIgnoresTrackingParameters() throws Exception {
        JobApplication owned = seed(alice, "Acme");
        owned.setTitle("Backend Engineer");
        owned.setPostingUrl("https://jobs.lever.co/acme/role-123/?utm_source=linkedin#apply");
        owned = applications.save(owned);
        JobApplication another = seed(bob, "Private Employer");
        another.setPostingUrl("https://jobs.lever.co/another/secret-1");
        applications.save(another);
        JobApplication legacy = seed(null, "Legacy Employer");
        legacy.setPostingUrl("https://jobs.lever.co/legacy/secret-2");
        applications.save(legacy);
        long before = applications.count();
        MockHttpSession aliceSession = login(alice.getEmail());
        mvc.perform(get("/api/applications/duplicate")
                        .param("url", "https://JOBS.LEVER.CO/acme/role-123?source=other")
                        .session(aliceSession))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.id").value(owned.getId()))
                .andExpect(jsonPath("$.company").value("Acme"))
                .andExpect(jsonPath("$.title").value("Backend Engineer"))
                .andExpect(jsonPath("$.status").value("SAVED"))
                .andExpect(jsonPath("$.postingUrl").doesNotExist())
                .andExpect(jsonPath("$.owner").doesNotExist());

        mvc.perform(get("/api/applications/duplicate")
                        .param("url", "https://jobs.lever.co/acme/role-123")
                        .param("excludeId", owned.getId().toString()).session(aliceSession))
                .andExpect(status().isNoContent())
                .andExpect(header().string("Cache-Control", "no-store"));
        mvc.perform(get("/api/applications/duplicate")
                        .param("url", "https://jobs.lever.co/another/secret-1").session(aliceSession))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/applications/duplicate")
                        .param("url", "https://jobs.lever.co/legacy/secret-2").session(aliceSession))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/applications/duplicate")
                        .param("url", "https://jobs.lever.co/acme/different-role").session(aliceSession))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/applications/duplicate")
                        .param("url", "https://jobs.lever.co/acme/role-123"))
                .andExpect(status().isUnauthorized());

        MockHttpSession bobSession = login(bob.getEmail());
        mvc.perform(get("/api/applications/duplicate")
                        .param("url", "https://jobs.lever.co/acme/role-123").session(bobSession))
                .andExpect(status().isNoContent());
        assertThat(applications.count()).isEqualTo(before);
    }

    @Test
    void duplicateLookupPreservesJobIdentifyingQueryParametersOnOtherSites() throws Exception {
        JobApplication owned = seed(alice, "Other Board");
        owned.setPostingUrl("https://jobs.example.com/search?job=123&utm_medium=email&lang=en");
        applications.save(owned);
        MockHttpSession session = login(alice.getEmail());
        mvc.perform(get("/api/applications/duplicate")
                        .param("url", "https://jobs.example.com/search?lang=en&job=123&source=feed")
                        .session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.company").value("Other Board"));
        mvc.perform(get("/api/applications/duplicate")
                        .param("url", "https://jobs.example.com/search?job=456&lang=en")
                        .session(session))
                .andExpect(status().isNoContent());
        for (String invalid : java.util.List.of("not-a-job-url",
                "javascript:alert(1)", "https://user@jobs.example.com/job",
                "https://jobs.example.com/%bad-escape%")) {
            mvc.perform(get("/api/applications/duplicate")
                            .param("url", invalid).session(session))
                    .andExpect(status().isBadRequest());
        }
        mvc.perform(get("/api/applications/duplicate")
                        .param("url", "https://jobs.example.com/" + "a".repeat(256)).session(session))
                .andExpect(status().isBadRequest());
    }

    @Test
    void listingSearchAndFiltersNeverIncludeAnotherUsersOrLegacyRows() throws Exception {
        JobApplication owned = seed(alice, "Acme");
        seed(bob, "Acme");
        seed(null, "Acme");
        MockHttpSession session = login(alice.getEmail());
        for (String query : java.util.List.of("", "?search=Acme", "?search=Engineer",
                "?search=Houston", "?status=SAVED&search=Acme")) {
            mvc.perform(get("/api/applications" + query).session(session))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items.length()").value(1))
                    .andExpect(jsonPath("$.items[0].id").value(owned.getId()));
        }
        mvc.perform(get("/api/applications?status=REJECTED").session(session))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void otherUsersAndLegacyApplicationsCannotBeChangedOrDeleted() throws Exception {
        long bobsId = seed(bob, "Bob company").getId();
        long legacyId = seed(null, "Legacy company").getId();
        MockHttpSession session = login(alice.getEmail());
        Csrf csrf = csrf(session);
        for (long id : new long[]{bobsId, legacyId, Long.MAX_VALUE}) {
            mvc.perform(put("/api/applications/" + id).session(session)
                            .header(csrf.header(), csrf.token())
                            .contentType(MediaType.APPLICATION_JSON).content(applicationBody()))
                    .andExpect(status().isNotFound());
            mvc.perform(patch("/api/applications/" + id + "/status").session(session)
                            .header(csrf.header(), csrf.token())
                            .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"OFFER\"}"))
                    .andExpect(status().isNotFound());
            mvc.perform(delete("/api/applications/" + id).session(session)
                            .header(csrf.header(), csrf.token()))
                    .andExpect(status().isNotFound());
        }
        assertThat(applications.findById(bobsId).orElseThrow().getCompany()).isEqualTo("Bob company");
        assertThat(applications.count()).isEqualTo(2);
    }

    @Test
    void ownerCanEditChangeStatusAndDelete() throws Exception {
        long id = seed(alice, "Original").getId();
        MockHttpSession session = login(alice.getEmail());
        Csrf csrf = csrf(session);
        mvc.perform(put("/api/applications/" + id).session(session)
                        .header(csrf.header(), csrf.token())
                        .contentType(MediaType.APPLICATION_JSON).content(applicationBody()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.company").value("Acme"));
        mvc.perform(patch("/api/applications/" + id + "/status").session(session)
                        .header(csrf.header(), csrf.token())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"INTERVIEW\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("INTERVIEW"));
        mvc.perform(delete("/api/applications/" + id).session(session)
                        .header(csrf.header(), csrf.token()))
                .andExpect(status().isNoContent());
        assertThat(applications.findById(id)).isEmpty();
    }

    @Test
    void reschedulingFollowUpsRequiresOwnershipValidationAndCsrf() throws Exception {
        JobApplication mine = seed(alice, "Reminder Co");
        mine.setFollowUpDate(java.time.LocalDate.of(2026, 10, 20));
        mine = applications.save(mine);
        JobApplication other = seed(bob, "Private Reminder");
        MockHttpSession session = login(alice.getEmail());
        Csrf csrf = csrf(session);
        mvc.perform(patch("/api/applications/" + mine.getId() + "/follow-up").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"followUpDate\":\"2026-10-30\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(patch("/api/applications/" + other.getId() + "/follow-up").session(session)
                        .header(csrf.header(), csrf.token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"followUpDate\":\"2026-10-30\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(patch("/api/applications/" + mine.getId() + "/follow-up").session(session)
                        .header(csrf.header(), csrf.token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"followUpDate\":null}"))
                .andExpect(status().isBadRequest());
        mvc.perform(patch("/api/applications/" + mine.getId() + "/follow-up").session(session)
                        .header(csrf.header(), csrf.token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"followUpDate\":\"2026-10-30\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.followUpDate").value("2026-10-30"))
                .andExpect(jsonPath("$.company").value("Reminder Co"));
        assertThat(applications.findById(mine.getId()).orElseThrow().getFollowUpDate())
                .isEqualTo(java.time.LocalDate.of(2026, 10, 30));
        assertThat(applications.findById(other.getId()).orElseThrow().getFollowUpDate())
                .isNull();
    }

    @Test
    void followUpDatesAreSavedUpdatedAndReturnedToTheOwner() throws Exception {
        MockHttpSession session = login(alice.getEmail());
        Csrf csrf = csrf(session);
        String body = json.writeValueAsString(Map.of(
                "company", "Acme", "title", "Engineer",
                "applicationDate", "2026-09-27", "followUpDate", "2026-10-01"));
        MvcResult created = mvc.perform(post("/api/applications").session(session)
                        .header(csrf.header(), csrf.token())
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.followUpDate").value("2026-10-01"))
                .andReturn();
        long id = json.readTree(created.getResponse().getContentAsString()).get("id").asLong();
        mvc.perform(put("/api/applications/" + id).session(session)
                        .header(csrf.header(), csrf.token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.replace("2026-10-01", "2026-10-08")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.followUpDate").value("2026-10-08"));
        mvc.perform(get("/api/applications").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].followUpDate").value("2026-10-08"));
    }

    @Test
    void logoutInvalidatesSession() throws Exception {
        MockHttpSession session = login(alice.getEmail());
        Csrf csrf = csrf(session);
        mvc.perform(post("/api/auth/logout").session(session).header(csrf.header(), csrf.token()))
                .andExpect(status().isNoContent());
        assertThat(session.isInvalid()).isTrue();
        mvc.perform(get("/api/applications")).andExpect(status().isUnauthorized());
    }

    @Test
    void paginationAndSortingKeepCountsAndRowsScopedToTheOwner() throws Exception {
        seed(alice, "Zulu");
        JobApplication first = seed(alice, "Acme");
        JobApplication second = seed(alice, "Acme");
        seed(bob, "Acme");
        seed(null, "Acme");
        MockHttpSession session = login(alice.getEmail());
        mvc.perform(get("/api/applications?size=2&sort=COMPANY").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(3))
                .andExpect(jsonPath("$.totalPages").value(2))
                .andExpect(jsonPath("$.items[0].id").value(second.getId()))
                .andExpect(jsonPath("$.items[1].id").value(first.getId()));
        mvc.perform(get("/api/applications?size=2&page=1&sort=COMPANY").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].company").value("Zulu"));
        mvc.perform(get("/api/applications?size=2&page=9").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0))
                .andExpect(jsonPath("$.totalElements").value(3));
        for (String query : java.util.List.of("size=0", "size=101", "page=-1", "page=2147483647", "sort=owner")) {
            mvc.perform(get("/api/applications?" + query).session(session))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.status").value(400));
        }
    }

    @Test
    void searchTreatsWildcardsLiterally() throws Exception {
        seed(alice, "100%_match!");
        seed(alice, "100 percent");
        MockHttpSession session = login(alice.getEmail());
        mvc.perform(get("/api/applications").param("search", "%_match!").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.items[0].company").value("100%_match!"));
    }

    @Test
    void jobPostingPreviewRequiresAuthenticationAndRejectsUnsafeLinks() throws Exception {
        mvc.perform(get("/api/job-postings/preview")
                        .param("url", "https://boards.greenhouse.io/acme/jobs/123"))
                .andExpect(status().isUnauthorized());

        MockHttpSession session = login(alice.getEmail());
        mvc.perform(get("/api/job-postings/preview").session(session)
                        .param("url", "http://localhost/private"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void postingLinksMustUseHttpOrHttps() throws Exception {
        MockHttpSession session = login(alice.getEmail());
        Csrf csrf = csrf(session);
        for (String url : java.util.List.of("javascript:alert(1)", "ftp://example.com/job", "not a URL")) {
            String body = json.writeValueAsString(Map.of("company", "Acme", "title", "Engineer",
                    "postingUrl", url, "applicationDate", "2026-09-27"));
            mvc.perform(post("/api/applications").session(session).header(csrf.header(), csrf.token())
                            .contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors.postingUrl").exists());
        }
    }

    private MockHttpSession login(String email) throws Exception {
        Csrf csrf = csrf(new MockHttpSession());
        mvc.perform(post("/api/auth/login").session(csrf.session())
                        .header(csrf.header(), csrf.token())
                        .param("email", email).param("password", PASSWORD))
                .andExpect(status().isNoContent());
        return csrf.session();
    }

    private Csrf csrf(MockHttpSession session) throws Exception {
        MvcResult result = mvc.perform(get("/api/auth/csrf").session(session))
                .andExpect(status().isOk()).andReturn();
        JsonNode token = json.readTree(result.getResponse().getContentAsString());
        return new Csrf(session, token.get("headerName").asText(), token.get("token").asText());
    }

    private JobApplication seed(UserAccount owner, String company) {
        JobApplication application = new JobApplication();
        application.setOwner(owner);
        application.setCompany(company);
        application.setTitle("Engineer");
        application.setLocation("Houston");
        return applications.save(application);
    }

    private String applicationBody() {
        return """
                {"company":"Acme","title":"Engineer","location":"Houston",
                 "postingUrl":"","notes":"Follow up","applicationDate":"2026-09-27",
                 "interviewDate":null}
                """;
    }

    private record Csrf(MockHttpSession session, String header, String token) {
    }
}
