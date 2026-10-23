package com.bharath.devtrack.dashboard;

import com.bharath.devtrack.interview.InterviewRound;
import java.time.LocalDate;
import java.time.LocalTime;

/** Dashboard projection excludes private preparation notes and recruiter contacts. */
public record UpcomingInterviewRoundResponse(
        Long roundId,
        Long applicationId,
        String company,
        String title,
        String roundName,
        InterviewRound.Format format,
        LocalDate scheduledDate,
        String scheduledTime,
        String timeZone
) {}
