package com.bharath.devtrack;

import com.bharath.devtrack.application.ApplicationActivity;
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
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.TemporalAdjusters;

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
    ApplicationActivityRepository activity;

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
        mvc.perform(get("/api/dashboard/follow-ups"))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/dashboard/follow-ups/upcoming"))
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

    @Test
    void followUpsAreOwnerScopedDueSortedAndLimitedToFive() throws Exception {
        LocalDate today = LocalDate.now(java.time.ZoneOffset.UTC);
        for (int i = 0; i < 7; i++) {
            JobApplication due = seed(alice, "Due " + i, ApplicationStatus.APPLIED, null);
            due.setFollowUpDate(today.minusDays(7 - i));
            applications.save(due);
        }
        JobApplication future = seed(alice, "Future", ApplicationStatus.APPLIED, null);
        future.setFollowUpDate(today.plusDays(1));
        applications.save(future);
        JobApplication done = seed(alice, "Rejected", ApplicationStatus.REJECTED, null);
        done.setFollowUpDate(today.minusDays(9));
        applications.save(done);
        JobApplication other = seed(bob, "Other owner", ApplicationStatus.APPLIED, null);
        other.setFollowUpDate(today.minusDays(10));
        applications.save(other);
        JobApplication legacy = seed(null, "Legacy", ApplicationStatus.APPLIED, null);
        legacy.setFollowUpDate(today.minusDays(11));
        applications.save(legacy);

        MockHttpSession session = login(alice.getEmail());
        mvc.perform(get("/api/dashboard/follow-ups").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(5))
                .andExpect(jsonPath("$[0].company").value("Due 0"))
                .andExpect(jsonPath("$[4].company").value("Due 4"))
                .andExpect(jsonPath("$[0].followUpDate")
                        .value(today.minusDays(7).toString()));
    }

    @Test
    void upcomingFollowUpsAreScopedSortedBoundedAndExcludeTerminalStages() throws Exception {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        for (int i = 1; i <= 7; i++) {
            JobApplication next = seed(alice, "Soon " + i, ApplicationStatus.APPLIED, null);
            next.setFollowUpDate(today.plusDays(i));
            applications.save(next);
        }
        JobApplication beyond = seed(alice, "Day 8", ApplicationStatus.INTERVIEW, null);
        beyond.setFollowUpDate(today.plusDays(8));
        applications.save(beyond);
        JobApplication due = seed(alice, "Today", ApplicationStatus.SAVED, null);
        due.setFollowUpDate(today);
        applications.save(due);
        JobApplication offered = seed(alice, "Offer", ApplicationStatus.OFFER, null);
        offered.setFollowUpDate(today.plusDays(2));
        applications.save(offered);
        JobApplication bobNext = seed(bob, "Private", ApplicationStatus.APPLIED, null);
        bobNext.setFollowUpDate(today.plusDays(1));
        applications.save(bobNext);
        JobApplication legacy = seed(null, "Legacy", ApplicationStatus.APPLIED, null);
        legacy.setFollowUpDate(today.plusDays(1));
        applications.save(legacy);
        mvc.perform(get("/api/dashboard/follow-ups/upcoming").session(login(alice.getEmail())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(5))
                .andExpect(jsonPath("$[0].company").value("Soon 1"))
                .andExpect(jsonPath("$[4].company").value("Soon 5"))
                .andExpect(jsonPath("$[0].followUpDate").value(today.plusDays(1).toString()));
        mvc.perform(get("/api/dashboard/follow-ups/upcoming").session(login(bob.getEmail())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].company").value("Private"));
    }

    @Test
    void followUpPriorityCountsIncludeAllDueItemsAndExcludeOtherOwnersOrTerminalStages() throws Exception {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        for (int i = 0; i < 7; i++) {
            JobApplication overdue = seed(alice, "Overdue " + i, ApplicationStatus.APPLIED, null);
            overdue.setFollowUpDate(today.minusDays(i + 1));
            applications.save(overdue);
        }
        JobApplication dueToday = seed(alice, "Due today", ApplicationStatus.INTERVIEW, null);
        dueToday.setFollowUpDate(today);
        applications.save(dueToday);
        JobApplication savedToday = seed(alice, "Saved today", ApplicationStatus.SAVED, null);
        savedToday.setFollowUpDate(today);
        applications.save(savedToday);

        JobApplication future = seed(alice, "Future", ApplicationStatus.APPLIED, null);
        future.setFollowUpDate(today.plusDays(1));
        applications.save(future);
        seed(alice, "No follow-up date", ApplicationStatus.APPLIED, null);
        JobApplication offered = seed(alice, "Already offered", ApplicationStatus.OFFER, null);
        offered.setFollowUpDate(today.minusDays(2));
        applications.save(offered);
        JobApplication rejected = seed(alice, "Rejected", ApplicationStatus.REJECTED, null);
        rejected.setFollowUpDate(today);
        applications.save(rejected);
        JobApplication bobOverdue = seed(bob, "Someone else's", ApplicationStatus.APPLIED, null);
        bobOverdue.setFollowUpDate(today.minusDays(4));
        applications.save(bobOverdue);
        JobApplication unowned = seed(null, "Pre-account record", ApplicationStatus.APPLIED, null);
        unowned.setFollowUpDate(today.minusDays(3));
        applications.save(unowned);

        MockHttpSession ownerSession = login(alice.getEmail());
        mvc.perform(get("/api/dashboard").session(ownerSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.overdueFollowUps").value(7))
                .andExpect(jsonPath("$.dueTodayFollowUps").value(2));
        mvc.perform(get("/api/dashboard/follow-ups").session(ownerSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(5))
                .andExpect(jsonPath("$[0].company").value("Overdue 6"));

        mvc.perform(get("/api/dashboard").session(login(bob.getEmail())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.overdueFollowUps").value(1))
                .andExpect(jsonPath("$.dueTodayFollowUps").value(0));
    }

    @Test
    void followUpPriorityCountsAreZeroWhenNoDatesAreDue() throws Exception {
        JobApplication future = seed(alice, "Future", ApplicationStatus.INTERVIEW, null);
        future.setFollowUpDate(LocalDate.now(ZoneOffset.UTC).plusDays(5));
        applications.save(future);
        mvc.perform(get("/api/dashboard").session(login(alice.getEmail())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.overdueFollowUps").value(0))
                .andExpect(jsonPath("$.dueTodayFollowUps").value(0));
    }

    @Test
    void weeklyAnalyticsCountOnlyRecordedOwnerEventsWithUtcBoundaries() throws Exception {
        LocalDate firstMonday = LocalDate.now(ZoneOffset.UTC)
                .with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).minusWeeks(5);
        Instant firstStart = firstMonday.atStartOfDay(ZoneOffset.UTC).toInstant();
        Instant secondStart = firstMonday.plusWeeks(1).atStartOfDay(ZoneOffset.UTC).toInstant();

        JobApplication mine = seed(alice, "My event", ApplicationStatus.INTERVIEW, null);
        JobApplication other = seed(bob, "Other account", ApplicationStatus.INTERVIEW, null);
        seed(alice, "Old record without history", ApplicationStatus.OFFER, null);
        activity.save(new ApplicationActivity(mine, alice, ApplicationActivity.Type.CREATED,
                null, ApplicationStatus.SAVED, firstStart));
        activity.save(new ApplicationActivity(mine, alice, ApplicationActivity.Type.STATUS_CHANGED,
                ApplicationStatus.SAVED, ApplicationStatus.INTERVIEW, secondStart));
        activity.save(new ApplicationActivity(mine, alice, ApplicationActivity.Type.CREATED,
                null, ApplicationStatus.SAVED, firstStart.minusSeconds(1)));
        activity.save(new ApplicationActivity(other, bob, ApplicationActivity.Type.CREATED,
                null, ApplicationStatus.SAVED, secondStart));
        activity.save(new ApplicationActivity(mine, alice, ApplicationActivity.Type.STATUS_CHANGED,
                ApplicationStatus.INTERVIEW, ApplicationStatus.OFFER, Instant.now().plusSeconds(86400)));

        mvc.perform(get("/api/dashboard/analytics").session(login(alice.getEmail())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.weeklyActivity.length()").value(6))
                .andExpect(jsonPath("$.weeklyActivity[0].weekStart").value(firstMonday.toString()))
                .andExpect(jsonPath("$.weeklyActivity[0].created").value(1))
                .andExpect(jsonPath("$.weeklyActivity[0].statusChanges").value(0))
                .andExpect(jsonPath("$.weeklyActivity[1].weekStart").value(firstMonday.plusWeeks(1).toString()))
                .andExpect(jsonPath("$.weeklyActivity[1].created").value(0))
                .andExpect(jsonPath("$.weeklyActivity[1].statusChanges").value(1))
                .andExpect(jsonPath("$.weeklyActivity[5].created").value(0))
                .andExpect(jsonPath("$.weeklyActivity[5].statusChanges").value(0));

        mvc.perform(get("/api/dashboard/analytics").session(login(bob.getEmail())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.weeklyActivity[1].created").value(1))
                .andExpect(jsonPath("$.weeklyActivity[1].statusChanges").value(0))
                .andExpect(jsonPath("$.weeklyActivity[0].created").value(0));
    }

    @Test
    void weeklyAnalyticsStayEmptyWhenOnlyLegacyStatesExist() throws Exception {
        seed(alice, "Pre-history offer", ApplicationStatus.OFFER, null);
        mvc.perform(get("/api/dashboard/analytics").session(login(alice.getEmail())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.trackedApplications").value(1))
                .andExpect(jsonPath("$.offersReached").value(1))
                .andExpect(jsonPath("$.weeklyActivity.length()").value(6))
                .andExpect(jsonPath("$.weeklyActivity[0].created").value(0))
                .andExpect(jsonPath("$.weeklyActivity[5].statusChanges").value(0));
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