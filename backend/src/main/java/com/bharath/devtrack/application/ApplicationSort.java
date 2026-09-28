package com.bharath.devtrack.application;

import org.springframework.data.domain.Sort;

public enum ApplicationSort {
    NEWEST, OLDEST, COMPANY, APPLICATION_DATE;

    public Sort toSort() {
        return switch (this) {
            case NEWEST -> Sort.by(Sort.Order.desc("id"));
            case OLDEST -> Sort.by(Sort.Order.asc("id"));
            case COMPANY -> Sort.by(Sort.Order.asc("company").ignoreCase(), Sort.Order.desc("id"));
            case APPLICATION_DATE -> Sort.by(Sort.Order.desc("applicationDate"), Sort.Order.desc("id"));
        };
    }
}
