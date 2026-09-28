package com.bharath.devtrack.dashboard;

import com.bharath.devtrack.auth.AccountService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.security.Principal;
import java.util.List;

@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

    private final DashboardService dashboardService;
    private final AccountService accounts;

    public DashboardController(
            DashboardService dashboardService,
            AccountService accounts
    ) {
        this.dashboardService = dashboardService;
        this.accounts = accounts;
    }

    @GetMapping
    public DashboardSummaryResponse getSummary(
            Principal principal
    ) {
        Long ownerId =
                accounts.currentUser(principal).getId();

        return dashboardService.getSummary(ownerId);
    }

    @GetMapping("/interviews")
    public List<UpcomingInterviewResponse> getUpcomingInterviews(
            Principal principal
    ) {
        Long ownerId =
                accounts.currentUser(principal).getId();

        return dashboardService.getUpcomingInterviews(ownerId);
    }
}