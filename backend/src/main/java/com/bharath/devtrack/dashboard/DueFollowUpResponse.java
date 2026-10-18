package com.bharath.devtrack.dashboard;

import java.time.LocalDate;

public record DueFollowUpResponse(
        Long id,
        String company,
        String title,
        LocalDate followUpDate
) {
}
