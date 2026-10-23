package com.bharath.devtrack.dashboard;

import com.bharath.devtrack.application.ApplicationActivity;
import com.bharath.devtrack.application.ApplicationStatus;
import com.bharath.devtrack.application.JobApplicationRepository;
import com.bharath.devtrack.interview.InterviewRound;
import com.bharath.devtrack.interview.InterviewRoundRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.List;

@Service
public class DashboardService {

    private final JobApplicationRepository repository;
    private final InterviewRoundRepository interviewRounds;
    private final com.bharath.devtrack.application.ApplicationActivityRepository activity;

    public DashboardService(JobApplicationRepository repository,
                            com.bharath.devtrack.application.ApplicationActivityRepository activity,
                            InterviewRoundRepository interviewRounds) {
        this.repository = repository;
        this.activity = activity;
        this.interviewRounds = interviewRounds;
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
                percentage(interviewOrOffer, total), percentage(offers, total), months,
                recordedWeeklyActivity(ownerId));
    }

    private List<DashboardAnalyticsResponse.WeeklyActivity> recordedWeeklyActivity(Long ownerId) {
        Instant now = Instant.now();
        LocalDate firstMonday = now.atZone(ZoneOffset.UTC).toLocalDate()
                .with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).minusWeeks(5);
        Instant start = firstMonday.atStartOfDay(ZoneOffset.UTC).toInstant();
        long[][] counts = new long[6][2];

        // Pre-history rows have no activity and cannot contribute to these totals.
        for (ApplicationActivity event : activity
                .findByOwner_IdAndOccurredAtGreaterThanEqualAndOccurredAtBefore(ownerId, start, now)) {
            LocalDate monday = event.getOccurredAt().atZone(ZoneOffset.UTC).toLocalDate()
                    .with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
            int index = (int) ChronoUnit.WEEKS.between(firstMonday, monday);
            if (index >= 0 && index < counts.length) {
                if (event.getType() == ApplicationActivity.Type.CREATED) counts[index][0]++;
                else if (event.getType() == ApplicationActivity.Type.STATUS_CHANGED) counts[index][1]++;
            }
        }

        List<DashboardAnalyticsResponse.WeeklyActivity> weeks = new ArrayList<>();
        for (int i = 0; i < counts.length; i++) {
            weeks.add(new DashboardAnalyticsResponse.WeeklyActivity(
                    firstMonday.plusWeeks(i).toString(), counts[i][0], counts[i][1]));
        }
        return weeks;
    }

    private double percentage(long numerator, long denominator) {
        return denominator == 0 ? 0 : Math.round(numerator * 1000.0 / denominator) / 10.0;
    }

    public DashboardSummaryResponse getSummary(Long ownerId) {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        List<ApplicationStatus> active = List.of(
                ApplicationStatus.SAVED, ApplicationStatus.APPLIED, ApplicationStatus.INTERVIEW);
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
                ),
                // Count every actionable follow-up, not only the five displayed below.
                repository.countByOwner_IdAndStatusInAndFollowUpDateBefore(ownerId, active, today),
                repository.countByOwner_IdAndStatusInAndFollowUpDate(ownerId, active, today)
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

    public List<DueFollowUpResponse> getUpcomingFollowUps(Long ownerId) {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        return repository
                .findTop5ByOwner_IdAndStatusInAndFollowUpDateBetweenOrderByFollowUpDateAscIdAsc(
                        ownerId,
                        List.of(ApplicationStatus.SAVED, ApplicationStatus.APPLIED, ApplicationStatus.INTERVIEW),
                        today.plusDays(1), today.plusDays(7))
                .stream()
                .map(application -> new DueFollowUpResponse(
                        application.getId(), application.getCompany(), application.getTitle(),
                        application.getFollowUpDate()))
                .toList();
    }

    public List<UpcomingInterviewRoundResponse> getUpcomingInterviewRounds(Long ownerId) {
        return interviewRounds.findDashboardUpcoming(
                ownerId,
                List.of(ApplicationStatus.SAVED, ApplicationStatus.APPLIED, ApplicationStatus.INTERVIEW),
                InterviewRound.Outcome.PLANNED,
                LocalDate.now(ZoneOffset.UTC),
                PageRequest.of(0, 5))
                .stream()
                .map(row -> {
                    InterviewRound round = (InterviewRound) row[0];
                    return new UpcomingInterviewRoundResponse(
                            round.getId(), round.getApplicationId(),
                            (String) row[1], (String) row[2],
                            round.getRoundName(), round.getFormat(), round.getScheduledDate(),
                            round.getScheduledTime() == null ? null : round.getScheduledTime().toString(),
                            round.getTimeZone());
                })
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