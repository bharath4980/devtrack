package com.bharath.devtrack.application;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
public class JobApplicationService {

    private final JobApplicationRepository repository;

    public JobApplicationService(JobApplicationRepository repository) {
        this.repository = repository;
    }

    public JobApplication create(CreateJobApplicationRequest request) {
        JobApplication application = new JobApplication();

        application.setCompany(request.company());
        application.setTitle(request.title());
        application.setLocation(request.location());
        application.setPostingUrl(request.postingUrl());
        application.setNotes(request.notes());
        application.setApplicationDate(request.applicationDate());

        return repository.save(application);
    }

    public List<JobApplication> findAll() {
        return repository.findAll();
    }

    public JobApplication updateStatus(
            Long id,
            UpdateApplicationStatusRequest request
    ) {
        JobApplication application = findById(id);

        application.setStatus(request.status());

        return repository.save(application);
    }

    public JobApplication update(
            Long id,
            UpdateJobApplicationRequest request
    ) {
        JobApplication application = findById(id);

        application.setCompany(request.company());
        application.setTitle(request.title());
        application.setLocation(request.location());
        application.setPostingUrl(request.postingUrl());
        application.setNotes(request.notes());
        application.setApplicationDate(request.applicationDate());
        application.setInterviewDate(request.interviewDate());

        return repository.save(application);
    }

    private JobApplication findById(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Application not found"
                ));
    }
}