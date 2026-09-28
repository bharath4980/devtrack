package com.bharath.devtrack.dashboard;

public record DashboardSummaryResponse(
        long total,
        long saved,
        long applied,
        long interview,
        long offer,
        long rejected
) {
}