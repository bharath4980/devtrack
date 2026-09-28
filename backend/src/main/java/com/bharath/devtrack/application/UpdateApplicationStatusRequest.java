package com.bharath.devtrack.application;

import jakarta.validation.constraints.NotNull;

public record UpdateApplicationStatusRequest(
        @NotNull ApplicationStatus status
) {
}