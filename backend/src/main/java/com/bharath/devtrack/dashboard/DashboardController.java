package com.bharath.devtrack.dashboard;

import com.bharath.devtrack.auth.AccountService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import java.time.ZoneId;
import java.time.DateTimeException;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.security.Principal;
import java.util.List;

@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

    private final DashboardService dashboardService;
    private final com.bharath.devtrack.application.ApplicationActivityService activity;
    private final AccountService accounts;

    public DashboardController(
            DashboardService dashboardService,
            com.bharath.devtrack.application.ApplicationActivityService activity,
            AccountService accounts
    ) {
        this.dashboardService = dashboardService;
        this.activity = activity;
        this.accounts = accounts;
    }

    private ZoneId clientZone(String timeZone) {
        try { return ZoneId.of(timeZone); }
        catch (DateTimeException | NullPointerException invalid) { return ZoneId.of("UTC"); }
    }

    @GetMapping
    public DashboardSummaryResponse getSummary(
            Principal principal, @RequestHeader(value = "X-DevTrack-Time-Zone", defaultValue = "UTC") String timeZone
    ) {
        Long ownerId =
                accounts.currentUser(principal).getId();

        return dashboardService.getSummary(ownerId, clientZone(timeZone));
    }

    @GetMapping("/activity")
    public List<com.bharath.devtrack.application.ApplicationActivityResponse> getRecentActivity(
            Principal principal) {
        return activity.recent(accounts.currentUser(principal).getId());
    }

    @GetMapping("/analytics")
    public DashboardAnalyticsResponse getAnalytics(Principal principal) {
        return dashboardService.getAnalytics(accounts.currentUser(principal).getId());
    }

    @GetMapping("/follow-ups")
    public List<DueFollowUpResponse> getDueFollowUps(Principal principal, @RequestHeader(value = "X-DevTrack-Time-Zone", defaultValue = "UTC") String timeZone) {
        Long ownerId = accounts.currentUser(principal).getId();
        return dashboardService.getDueFollowUps(ownerId, clientZone(timeZone));
    }

    @GetMapping("/follow-ups/upcoming")
    public List<DueFollowUpResponse> getUpcomingFollowUps(Principal principal, @RequestHeader(value = "X-DevTrack-Time-Zone", defaultValue = "UTC") String timeZone) {
        return dashboardService.getUpcomingFollowUps(accounts.currentUser(principal).getId(), clientZone(timeZone));
    }

    @GetMapping("/interviews/rounds")
    public List<UpcomingInterviewRoundResponse> getUpcomingInterviewRounds(Principal principal, @RequestHeader(value = "X-DevTrack-Time-Zone", defaultValue = "UTC") String timeZone) {
        return dashboardService.getUpcomingInterviewRounds(accounts.currentUser(principal).getId(), clientZone(timeZone));
    }

    @GetMapping("/interviews")
    public List<UpcomingInterviewResponse> getUpcomingInterviews(
            Principal principal, @RequestHeader(value = "X-DevTrack-Time-Zone", defaultValue = "UTC") String timeZone
    ) {
        Long ownerId =
                accounts.currentUser(principal).getId();

        return dashboardService.getUpcomingInterviews(ownerId, clientZone(timeZone));
    }
}