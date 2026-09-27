package com.bharath.devtrack.application;

import org.springframework.stereotype.Service;

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
}