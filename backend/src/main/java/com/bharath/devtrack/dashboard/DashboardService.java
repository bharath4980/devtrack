package com.bharath.devtrack.dashboard;

import com.bharath.devtrack.application.ApplicationStatus;
import com.bharath.devtrack.application.JobApplicationRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;

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

    public List<UpcomingInterviewResponse> getUpcomingInterviews(
            Long ownerId
    ) {
        return repository
                .findTop5ByOwner_IdAndInterviewDateGreaterThanEqualOrderByInterviewDateAsc(
                        ownerId,
                        LocalDate.now()
                )
                .stream()
                .map(application ->
                        new UpcomingInterviewResponse(
                                application.getId(),
                                application.getCompany(),
                                application.getTitle(),
                                application.getInterviewDate()
                        )
                )
                .toList();
    }
}