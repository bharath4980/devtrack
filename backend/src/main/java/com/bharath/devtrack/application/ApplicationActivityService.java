package com.bharath.devtrack.application;

import com.bharath.devtrack.auth.UserAccount;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.Instant;
import java.util.List;

@Service
public class ApplicationActivityService {
    private final ApplicationActivityRepository activity;
    private final JobApplicationRepository applications;

    public ApplicationActivityService(ApplicationActivityRepository activity,
                                      JobApplicationRepository applications) {
        this.activity = activity;
        this.applications = applications;
    }

    // Called inside the same transaction as the application mutation.
    @Transactional
    public void recordCreated(JobApplication application, UserAccount owner) {
        activity.save(new ApplicationActivity(application, owner, ApplicationActivity.Type.CREATED,
                null, application.getStatus(), Instant.now()));
    }

    @Transactional
    public void recordStatusChange(JobApplication application, UserAccount owner,
                                   ApplicationStatus previous) {
        activity.save(new ApplicationActivity(application, owner, ApplicationActivity.Type.STATUS_CHANGED,
                previous, application.getStatus(), Instant.now()));
    }

    @Transactional
    public void recordFollowUpCompleted(JobApplication application, UserAccount owner) {
        activity.save(new ApplicationActivity(application, owner,
                ApplicationActivity.Type.FOLLOW_UP_COMPLETED,
                null, application.getStatus(), Instant.now()));
    }

    @Transactional(readOnly = true)
    public List<ApplicationActivityResponse> getForApplication(Long ownerId, Long applicationId) {
        applications.findByIdAndOwner_Id(applicationId, ownerId).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Application not found"));
        return activity.findTop20ByApplication_IdAndOwner_IdOrderByOccurredAtDescIdDesc(
                applicationId, ownerId).stream().map(ApplicationActivityResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public List<ApplicationActivityResponse> recent(Long ownerId) {
        return activity.findTop12ByOwner_IdOrderByOccurredAtDescIdDesc(ownerId)
                .stream().map(ApplicationActivityResponse::from).toList();
    }
}
