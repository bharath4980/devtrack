package com.bharath.devtrack.dashboard;

import com.bharath.devtrack.application.ApplicationStatus;
import com.bharath.devtrack.application.JobApplicationRepository;
import org.springframework.stereotype.Service;

@Service
public class DashboardService {

    private final JobApplicationRepository repository;

    public DashboardService(JobApplicationRepository repository) {
        this.repository = repository;
    }

    public DashboardSummaryResponse getSummary(Long ownerId) {
        return new DashboardSummaryResponse(
                repository.countByOwner_Id(ownerId),
                repository.countByOwner_IdAndStatus(
                        ownerId,
                        ApplicationStatus.SAVED
                ),
                repository.countByOwner_IdAndStatus(
                        ownerId,
                        ApplicationStatus.APPLIED
                ),
                repository.countByOwner_IdAndStatus(
                        ownerId,
                        ApplicationStatus.INTERVIEW
                ),
                repository.countByOwner_IdAndStatus(
                        ownerId,
                        ApplicationStatus.OFFER
                ),
                repository.countByOwner_IdAndStatus(
                        ownerId,
                        ApplicationStatus.REJECTED
                )
        );
    }
}