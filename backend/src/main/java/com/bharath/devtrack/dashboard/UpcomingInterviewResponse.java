package com.bharath.devtrack.dashboard;

import java.time.LocalDate;

public record UpcomingInterviewResponse(
        Long id,
        String company,
        String title,
        LocalDate interviewDate
) {
}