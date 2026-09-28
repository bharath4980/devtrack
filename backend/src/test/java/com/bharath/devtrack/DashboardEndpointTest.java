package com.bharath.devtrack;

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
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.time.LocalDate;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.datasource.url=${TEST_DATABASE_URL:jdbc:h2:mem:dashboard;DB_CLOSE_DELAY=-1}",
        "spring.datasource.driver-class-name=${TEST_DATABASE_DRIVER:org.h2.Driver}",
        "spring.datasource.username=${TEST_DATABASE_USER:sa}",
        "spring.datasource.password=${TEST_DATABASE_PASSWORD:}",
        "devtrack.auth.account-limit=1000",
        "devtrack.auth.registration-limit=1000",
        "devtrack.auth.login-limit=1000"
})
@AutoConfigureMockMvc
class DashboardEndpointTest {

    private static final String PASSWORD = "correct-horse-battery";

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper json;

    @Autowired
    UserAccountRepository users;

    @Autowired
    JobApplicationRepository applications;

    @Autowired
    PasswordEncoder encoder;

    UserAccount alice;
    UserAccount bob;

    @BeforeEach
    void setUp() {
        applications.deleteAll();
        users.deleteAll();

        alice = users.save(
                new UserAccount(
                        "alice@example.com",
                        encoder.encode(PASSWORD)));

        bob = users.save(
                new UserAccount(
                        "bob@example.com",
                        encoder.encode(PASSWORD)));
    }

    @Test
    void dashboardEndpointsRequireAuthentication() throws Exception {
        mvc.perform(get("/api/dashboard"))
                .andExpect(status().isUnauthorized());

        mvc.perform(get("/api/dashboard/interviews"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void summaryOnlyCountsSignedInUsersApplications() throws Exception {
        seed(
                alice,
                "Saved One",
                ApplicationStatus.SAVED,
                null);

        seed(
                alice,
                "Saved Two",
                ApplicationStatus.SAVED,
                null);

        seed(
                alice,
                "Applied",
                ApplicationStatus.APPLIED,
                null);

        seed(
                alice,
                "Interview",
                ApplicationStatus.INTERVIEW,
                LocalDate.now(java.time.ZoneOffset.UTC).plusDays(2));

        seed(
                alice,
                "Offer",
                ApplicationStatus.OFFER,
                null);

        seed(
                alice,
                "Rejected",
                ApplicationStatus.REJECTED,
                null);

        seed(
                bob,
                "Bob Application",
                ApplicationStatus.OFFER,
                null);

        seed(
                null,
                "Legacy Application",
                ApplicationStatus.REJECTED,
                null);

        MockHttpSession session = login(alice.getEmail());

        mvc.perform(
                get("/api/dashboard")
                        .session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(6))
                .andExpect(jsonPath("$.saved").value(2))
                .andExpect(jsonPath("$.applied").value(1))
                .andExpect(jsonPath("$.interview").value(1))
                .andExpect(jsonPath("$.offer").value(1))
                .andExpect(jsonPath("$.rejected").value(1));
    }

    @Test
    void upcomingInterviewsAreScopedSortedAndLimitedToFive()
            throws Exception {

        LocalDate today = LocalDate.now(java.time.ZoneOffset.UTC);

        seed(
                alice,
                "Interview Six",
                ApplicationStatus.INTERVIEW,
                today.plusDays(6));

        seed(
                alice,
                "Interview Three",
                ApplicationStatus.INTERVIEW,
                today.plusDays(3));

        seed(
                alice,
                "Interview One",
                ApplicationStatus.INTERVIEW,
                today.plusDays(1));

        seed(
                alice,
                "Interview Five",
                ApplicationStatus.INTERVIEW,
                today.plusDays(5));

        seed(
                alice,
                "Interview Two",
                ApplicationStatus.INTERVIEW,
                today.plusDays(2));

        seed(
                alice,
                "Interview Four",
                ApplicationStatus.INTERVIEW,
                today.plusDays(4));

        seed(
                alice,
                "Past Interview",
                ApplicationStatus.INTERVIEW,
                today.minusDays(1));
        seed(
                alice,
                "Applied With Future Interview Date",
                ApplicationStatus.APPLIED,
                today.plusDays(1));

        seed(
                bob,
                "Bob Interview",
                ApplicationStatus.INTERVIEW,
                today.plusDays(1));

        seed(
                null,
                "Legacy Interview",
                ApplicationStatus.INTERVIEW,
                today.plusDays(1));

        MockHttpSession session = login(alice.getEmail());

        mvc.perform(
                get("/api/dashboard/interviews")
                        .session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(5))
                .andExpect(
                        jsonPath("$[0].company")
                                .value("Interview One"))
                .andExpect(
                        jsonPath("$[1].company")
                                .value("Interview Two"))
                .andExpect(
                        jsonPath("$[2].company")
                                .value("Interview Three"))
                .andExpect(
                        jsonPath("$[3].company")
                                .value("Interview Four"))
                .andExpect(
                        jsonPath("$[4].company")
                                .value("Interview Five"))
                .andExpect(
                        jsonPath("$[0].interviewDate")
                                .value(
                                        today.plusDays(1)
                                                .toString()))
                .andExpect(
                        jsonPath("$[4].interviewDate")
                                .value(
                                        today.plusDays(5)
                                                .toString()));
    }

    private JobApplication seed(
            UserAccount owner,
            String company,
            ApplicationStatus status,
            LocalDate interviewDate) {
        JobApplication application = new JobApplication();

        application.setOwner(owner);
        application.setCompany(company);
        application.setTitle("Software Engineer");
        application.setLocation("Houston");
        application.setStatus(status);
        application.setInterviewDate(interviewDate);

        return applications.save(application);
    }

    private MockHttpSession login(String email)
            throws Exception {

        Csrf csrf = csrf(new MockHttpSession());

        mvc.perform(
                post("/api/auth/login")
                        .session(csrf.session())
                        .header(
                                csrf.header(),
                                csrf.token())
                        .param("email", email)
                        .param(
                                "password",
                                PASSWORD))
                .andExpect(status().isNoContent());

        return csrf.session();
    }

    private Csrf csrf(MockHttpSession session)
            throws Exception {

        MvcResult result = mvc.perform(
                get("/api/auth/csrf")
                        .session(session))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode token = json.readTree(
                result.getResponse()
                        .getContentAsString());

        return new Csrf(
                session,
                token.get("headerName").asText(),
                token.get("token").asText());
    }

    private record Csrf(
            MockHttpSession session,
            String header,
            String token) {
    }
}