package com.bharath.devtrack.application;

import org.springframework.data.domain.Page;
import java.util.List;

public record ApplicationPage(List<JobApplication> items, int page, int size,
                              long totalElements, int totalPages) {
    public static ApplicationPage from(Page<JobApplication> page) {
        return new ApplicationPage(page.getContent(), page.getNumber(), page.getSize(),
                page.getTotalElements(), page.getTotalPages());
    }
}
