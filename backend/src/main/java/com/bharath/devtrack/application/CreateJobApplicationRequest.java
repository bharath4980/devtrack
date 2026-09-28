package com.bharath.devtrack.application;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import org.hibernate.validator.constraints.URL;

public record CreateJobApplicationRequest(
        @NotBlank
        @Size(max = 255)
        String company,

        @NotBlank
        @Size(max = 255)
        String title,

        @Size(max = 255)
        String location,

        @Size(max = 255)
        @URL(regexp = "(?i)(|https?://.*)", message = "Use a complete http:// or https:// URL")
        String postingUrl,

        @Size(max = 2000)
        String notes,

        @NotNull
        LocalDate applicationDate
) {
}