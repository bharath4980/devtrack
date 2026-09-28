package com.bharath.devtrack.application;

import com.bharath.devtrack.auth.UserAccount;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
@Transactional
public class JobApplicationService {

    private final JobApplicationRepository repository;

    public JobApplicationService(JobApplicationRepository repository) {
        this.repository = repository;
    }

    public JobApplication create(
            UserAccount owner,
            CreateJobApplicationRequest request
    ) {
        JobApplication application = new JobApplication();

        application.setOwner(owner);
        application.setCompany(request.company());
        application.setTitle(request.title());
        application.setLocation(request.location());
        application.setPostingUrl(request.postingUrl());
        application.setNotes(request.notes());
        application.setApplicationDate(request.applicationDate());

        return repository.save(application);
    }

    public List<JobApplication> findAll(
            Long ownerId,
            String search,
            ApplicationStatus status
    ) {
        String normalizedSearch =
                search == null || search.isBlank()
                        ? ""
                        : search.trim();

        return repository.search(
                ownerId,
                normalizedSearch,
                status
        );
    }

    public JobApplication updateStatus(
            Long ownerId,
            Long id,
            UpdateApplicationStatusRequest request
    ) {
        JobApplication application =
                findById(id, ownerId);

        application.setStatus(request.status());

        return repository.save(application);
    }

    public JobApplication update(
            Long ownerId,
            Long id,
            UpdateJobApplicationRequest request
    ) {
        JobApplication application =
                findById(id, ownerId);

        application.setCompany(request.company());
        application.setTitle(request.title());
        application.setLocation(request.location());
        application.setPostingUrl(request.postingUrl());
        application.setNotes(request.notes());
        application.setApplicationDate(request.applicationDate());
        application.setInterviewDate(request.interviewDate());

        return repository.save(application);
    }

    public void delete(Long ownerId, Long id) {
        JobApplication application =
                findById(id, ownerId);

        repository.delete(application);
    }

    private JobApplication findById(
            Long id,
            Long ownerId
    ) {
        return repository.findByIdAndOwner_Id(
                        id,
                        ownerId
                )
                .orElseThrow(() ->
                        new ResponseStatusException(
                                HttpStatus.NOT_FOUND,
                                "Application not found"
                        )
                );
    }
}