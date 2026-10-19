package com.bharath.devtrack.dashboard;

import java.util.List;

public record DashboardAnalyticsResponse(
        long trackedApplications,
        long interviewOrOfferReached,
        long offersReached,
        double interviewOrOfferRate,
        double offerRate,
        List<MonthlyApplications> monthlyApplications,
        List<WeeklyActivity> weeklyActivity
) {
    public record MonthlyApplications(String month, long applications) {}
    public record WeeklyActivity(String weekStart, long created, long statusChanges) {}
}
