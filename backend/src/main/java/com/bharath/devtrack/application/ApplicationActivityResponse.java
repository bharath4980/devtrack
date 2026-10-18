package com.bharath.devtrack.application;

import java.time.Instant;

public record ApplicationActivityResponse(
        Long id,
        Long applicationId,
        String company,
        String title,
        ApplicationActivity.Type type,
        ApplicationStatus fromStatus,
        ApplicationStatus toStatus,
        Instant occurredAt
) {
    public static ApplicationActivityResponse from(ApplicationActivity activity) {
        JobApplication application = activity.getApplication();
        return new ApplicationActivityResponse(
                activity.getId(), application.getId(),
                application.getCompany(), application.getTitle(),
                activity.getType(), activity.getFromStatus(),
                activity.getToStatus(), activity.getOccurredAt());
    }
}
