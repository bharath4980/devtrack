package com.bharath.devtrack;

import com.bharath.devtrack.application.ApplicationStatus;
import com.bharath.devtrack.application.JobApplication;
import com.bharath.devtrack.application.JobApplicationRepository;
import com.bharath.devtrack.auth.UserAccount;
import com.bharath.devtrack.auth.UserAccountRepository;
import com.bharath.devtrack.interview.InterviewRound;
import com.bharath.devtrack.interview.InterviewRoundRepository;
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

import java.time.LocalDate;
import java.time.ZoneOffset;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
        "spring.datasource.url=${TEST_DATABASE_URL:jdbc:h2:mem:dashboardInterviewRounds;DB_CLOSE_DELAY=-1}",
        "spring.datasource.driver-class-name=${TEST_DATABASE_DRIVER:org.h2.Driver}",
        "spring.datasource.username=${TEST_DATABASE_USER:sa}",
        "spring.datasource.password=${TEST_DATABASE_PASSWORD:}",
        "devtrack.auth.account-limit=1000", "devtrack.auth.login-limit=1000",
        "devtrack.auth.registration-limit=1000"
})
@AutoConfigureMockMvc
class UpcomingInterviewRoundDashboardTest {
    private static final String PASSWORD = "correct-horse-battery";
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserAccountRepository users;
    @Autowired JobApplicationRepository applications;
    @Autowired InterviewRoundRepository rounds;
    @Autowired PasswordEncoder encoder;
    UserAccount alice;
    UserAccount bob;

    @BeforeEach
    void setUp() {
        rounds.deleteAll();
        applications.deleteAll();
        users.deleteAll();
        alice = users.save(new UserAccount("alice@example.com", encoder.encode(PASSWORD)));
        bob = users.save(new UserAccount("bob@example.com", encoder.encode(PASSWORD)));
    }

    @Test
    void plannedRoundsAreOwnerScopedOrderedLimitedAndHidePrivateFields() throws Exception {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        mvc.perform(get("/api/dashboard/interviews/rounds"))
                .andExpect(status().isUnauthorized());

        // Reverse date order deliberately, to prove earliest-first server ordering.
        for (int days = 7; days >= 1; days--) {
            JobApplication app = seed(alice, "Scheduled " + days, ApplicationStatus.INTERVIEW);
            schedule(app, "Screen " + days, today.plusDays(days), InterviewRound.Outcome.PLANNED);
        }
        JobApplication activeSaved = seed(alice, "Saved active", ApplicationStatus.SAVED);
        schedule(activeSaved, "Saved round", today.plusDays(1), InterviewRound.Outcome.PLANNED);
        JobApplication other = seed(bob, "Another account", ApplicationStatus.INTERVIEW);
        schedule(other, "Private screen", today, InterviewRound.Outcome.PLANNED);
        JobApplication offered = seed(alice, "Already offered", ApplicationStatus.OFFER);
        schedule(offered, "Not active", today, InterviewRound.Outcome.PLANNED);
        JobApplication rejected = seed(alice, "Rejected role", ApplicationStatus.REJECTED);
        schedule(rejected, "Not actionable", today, InterviewRound.Outcome.PLANNED);
        JobApplication past = seed(alice, "Past role", ApplicationStatus.INTERVIEW);
        schedule(past, "Past round", today.minusDays(1), InterviewRound.Outcome.PLANNED);
        JobApplication done = seed(alice, "Completed role", ApplicationStatus.INTERVIEW);
        schedule(done, "Completed round", today, InterviewRound.Outcome.COMPLETED);
        schedule(done, "Cancelled round", today, InterviewRound.Outcome.CANCELLED);
        schedule(done, "Undated round", null, InterviewRound.Outcome.PLANNED);

        mvc.perform(get("/api/dashboard/interviews/rounds").session(login(alice.getEmail())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(5))
                .andExpect(jsonPath("$[0].roundName").value("Screen 1"))
                .andExpect(jsonPath("$[1].roundName").value("Saved round"))
                .andExpect(jsonPath("$[2].roundName").value("Screen 2"))
                .andExpect(jsonPath("$[4].roundName").value("Screen 4"))
                .andExpect(jsonPath("$[0].scheduledDate").value(today.plusDays(1).toString()))
                .andExpect(jsonPath("$[0].format").value("VIDEO"))
                .andExpect(jsonPath("$[0].applicationId").exists())
                .andExpect(jsonPath("$[0].roundId").exists())
                .andExpect(jsonPath("$[0].contactEmail").doesNotExist())
                .andExpect(jsonPath("$[0].preparationNotes").doesNotExist())
                .andExpect(jsonPath("$[0].ownerId").doesNotExist());

        mvc.perform(get("/api/dashboard/interviews/rounds").session(login(bob.getEmail())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].roundName").value("Private screen"));
    }

    @Test
    void newlyScheduledAndCompletedRoundsChangeTheUpcomingFeed() throws Exception {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        JobApplication app = seed(alice, "Interview to complete", ApplicationStatus.APPLIED);
        InterviewRound round = schedule(app, "Technical interview", today.plusDays(2),
                InterviewRound.Outcome.PLANNED);
        MockHttpSession session = login(alice.getEmail());
        mvc.perform(get("/api/dashboard/interviews/rounds").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].company").value("Interview to complete"));
        round.setOutcome(InterviewRound.Outcome.COMPLETED);
        rounds.save(round);
        mvc.perform(get("/api/dashboard/interviews/rounds").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    private JobApplication seed(UserAccount owner, String company, ApplicationStatus status) {
        JobApplication app = new JobApplication();
        app.setOwner(owner);
        app.setCompany(company);
        app.setTitle("Software Engineer");
        app.setStatus(status);
        return applications.save(app);
    }

    private InterviewRound schedule(JobApplication app, String name, LocalDate date, InterviewRound.Outcome outcome) {
        InterviewRound round = new InterviewRound();
        round.setApplicationId(app.getId());
        round.setOwnerId(app.getOwner().getId());
        round.setRoundName(name);
        round.setScheduledDate(date);
        round.setFormat(InterviewRound.Format.VIDEO);
        round.setOutcome(outcome);
        round.setContactEmail("confidential@example.com");
        round.setPreparationNotes("Confidential preparation notes");
        return rounds.save(round);
    }

    private MockHttpSession login(String email) throws Exception {
        MockHttpSession session = new MockHttpSession();
        JsonNode token = json.readTree(mvc.perform(get("/api/auth/csrf").session(session))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        mvc.perform(post("/api/auth/login").session(session)
                .header(token.get("headerName").asText(), token.get("token").asText())
                .param("email", email).param("password", PASSWORD))
                .andExpect(status().isNoContent());
        return session;
    }
}
