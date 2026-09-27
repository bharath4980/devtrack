package com.bharath.devtrack.application;

import jakarta.validation.constraints.NotBlank;

import java.time.LocalDate;

public record UpdateJobApplicationRequest(
        @NotBlank String company,
        @NotBlank String title,
        String location,
        String postingUrl,
        String notes,
        LocalDate applicationDate,
        LocalDate interviewDate
) {
}