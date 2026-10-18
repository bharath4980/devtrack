package com.bharath.devtrack.dashboard;

import com.bharath.devtrack.application.ApplicationStatus;
import com.bharath.devtrack.application.JobApplicationRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

@Service
public class DashboardService {

    private final JobApplicationRepository repository;
    private final com.bharath.devtrack.application.ApplicationActivityRepository activity;

    public DashboardService(JobApplicationRepository repository,
                            com.bharath.devtrack.application.ApplicationActivityRepository activity) {
        this.repository = repository;
        this.activity = activity;
    }

    public DashboardAnalyticsResponse getAnalytics(Long ownerId) {
        long total = repository.countByOwner_Id(ownerId);
        // Include both current states and states recorded after history tracking began.
        long interviewOrOffer = activity.countReachedStatuses(ownerId,
                List.of(ApplicationStatus.INTERVIEW, ApplicationStatus.OFFER));
        long offers = activity.countReachedStatuses(ownerId, List.of(ApplicationStatus.OFFER));

        YearMonth first = YearMonth.now(ZoneOffset.UTC).minusMonths(5);
        List<LocalDate> dates = repository.findApplicationDatesForAnalytics(
                ownerId, first.atDay(1), LocalDate.now(ZoneOffset.UTC));
        List<DashboardAnalyticsResponse.MonthlyApplications> months = new ArrayList<>();
        for (int index = 0; index < 6; index++) {
            YearMonth month = first.plusMonths(index);
            long count = dates.stream().filter(day -> YearMonth.from(day).equals(month)).count();
            months.add(new DashboardAnalyticsResponse.MonthlyApplications(month.toString(), count));
        }
        return new DashboardAnalyticsResponse(total, interviewOrOffer, offers,
                percentage(interviewOrOffer, total), percentage(offers, total), months);
    }

    private double percentage(long numerator, long denominator) {
        return denominator == 0 ? 0 : Math.round(numerator * 1000.0 / denominator) / 10.0;
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

    public List<DueFollowUpResponse> getDueFollowUps(Long ownerId) {
        return repository
                .findTop5ByOwner_IdAndStatusInAndFollowUpDateLessThanEqualOrderByFollowUpDateAscIdAsc(
                        ownerId,
                        List.of(ApplicationStatus.SAVED, ApplicationStatus.APPLIED, ApplicationStatus.INTERVIEW),
                        LocalDate.now(java.time.ZoneOffset.UTC)
                )
                .stream()
                .map(application -> new DueFollowUpResponse(
                        application.getId(),
                        application.getCompany(),
                        application.getTitle(),
                        application.getFollowUpDate()
                ))
                .toList();
    }

    public List<UpcomingInterviewResponse> getUpcomingInterviews(
            Long ownerId
    ) {
        return repository
                .findTop5ByOwner_IdAndStatusAndInterviewDateGreaterThanEqualOrderByInterviewDateAsc(
                        ownerId,
                        ApplicationStatus.INTERVIEW,
                        LocalDate.now(java.time.ZoneOffset.UTC)
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