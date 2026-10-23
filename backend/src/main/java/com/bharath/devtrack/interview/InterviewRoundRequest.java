package com.bharath.devtrack.interview;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

public record InterviewRoundRequest(
        @NotBlank @Size(max = 120) String roundName,
        LocalDate scheduledDate,
        @NotNull InterviewRound.Format format,
        @Size(max = 255) String contactName,
        @Email @Size(max = 254) String contactEmail,
        @Size(max = 2000) String preparationNotes,
        @Size(max = 2000) String followUpNotes,
        @NotNull InterviewRound.Outcome outcome
) {}
