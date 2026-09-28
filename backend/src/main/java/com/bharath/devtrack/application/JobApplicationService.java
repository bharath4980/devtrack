package com.bharath.devtrack.application;

import com.bharath.devtrack.auth.UserAccount;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import org.springframework.data.domain.PageRequest;

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
        application.setCompany(request.company().trim());
        application.setTitle(request.title().trim());
        application.setLocation(request.location());
        application.setPostingUrl(request.postingUrl());
        application.setNotes(request.notes());
        application.setApplicationDate(request.applicationDate());

        return repository.save(application);
    }

    @Transactional(readOnly = true)
    public ApplicationPage findAll(Long ownerId, String search, ApplicationStatus status,
                                   int page, int size, ApplicationSort sort) {
        if (page < 0 || size < 1 || size > 100 || (long) page * size > Integer.MAX_VALUE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Use a non-negative page and a page size between 1 and 100");
        }
        String normalized = search == null ? "" : search.trim();
        if (normalized.length() > 255) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Search must be 255 characters or fewer");
        }
        String escaped = normalized.replace("!", "!!").replace("%", "!%").replace("_", "!_");
        return ApplicationPage.from(repository.search(ownerId, escaped, status,
                PageRequest.of(page, size, sort.toSort())));
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

        application.setCompany(request.company().trim());
        application.setTitle(request.title().trim());
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