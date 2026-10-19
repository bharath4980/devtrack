package com.bharath.devtrack.application;

import com.bharath.devtrack.auth.UserAccount;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import org.springframework.data.domain.PageRequest;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;

@Service
@Transactional
public class JobApplicationService {

    private static final int MAX_EXPORT_ROWS = 10_000;
    private static final String CSV_HEADER =
            "id,company,title,location,status,application_date,interview_date,follow_up_date,posting_url,notes";

    private final JobApplicationRepository repository;
    private final ApplicationActivityService activity;

    public JobApplicationService(JobApplicationRepository repository, ApplicationActivityService activity) {
        this.repository = repository;
        this.activity = activity;
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
        application.setFollowUpDate(request.followUpDate());

        JobApplication saved = repository.save(application);
        activity.recordCreated(saved, owner);
        return saved;
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

    /**
     * Exports all owned applications independent of UI filters and pagination.
     * Never return a partial export: explicitly reject more than MAX_EXPORT_ROWS.
     */
    @Transactional(readOnly = true)
    public byte[] exportCsv(Long ownerId) {
        List<JobApplication> applications = repository.findByOwner_IdOrderByIdAsc(
                ownerId, PageRequest.of(0, MAX_EXPORT_ROWS + 1));
        if (applications.size() > MAX_EXPORT_ROWS) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,
                    "CSV export supports up to 10,000 applications. Contact support for larger exports.");
        }

        StringBuilder csv = new StringBuilder("\uFEFF").append(CSV_HEADER).append("\r\n");
        for (JobApplication application : applications) {
            csv.append(csvCell(application.getId().toString())).append(',')
                    .append(csvCell(application.getCompany())).append(',')
                    .append(csvCell(application.getTitle())).append(',')
                    .append(csvCell(application.getLocation())).append(',')
                    .append(csvCell(application.getStatus().name())).append(',')
                    .append(csvCell(csvDate(application.getApplicationDate()))).append(',')
                    .append(csvCell(csvDate(application.getInterviewDate()))).append(',')
                    .append(csvCell(csvDate(application.getFollowUpDate()))).append(',')
                    .append(csvCell(application.getPostingUrl())).append(',')
                    .append(csvCell(application.getNotes())).append("\r\n");
        }
        return csv.toString().getBytes(StandardCharsets.UTF_8);
    }

    private static String csvDate(LocalDate value) {
        return value == null ? "" : value.toString();
    }

    private static String csvCell(String text) {
        String value = text == null ? "" : text;
        String stripped = value.stripLeading();
        // Avoid CSV formula execution in spreadsheet programs, including prefixed whitespace.
        if ((!stripped.isEmpty() && "=+-@".indexOf(stripped.charAt(0)) >= 0)
                || (!value.isEmpty() && (value.charAt(0) == '\t'
                        || value.charAt(0) == '\r' || value.charAt(0) == '\n'))) {
            value = "'" + value;
        }
        return "\"" + value.replace("\"", "\"\"") + "\"";
    }

    public JobApplication updateStatus(
            Long ownerId,
            Long id,
            UpdateApplicationStatusRequest request
    ) {
        JobApplication application =
                findById(id, ownerId);

        if (application.getStatus() == request.status()) {
            return application;
        }
        ApplicationStatus previous = application.getStatus();
        application.setStatus(request.status());
        JobApplication saved = repository.save(application);
        activity.recordStatusChange(saved, application.getOwner(), previous);
        return saved;
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
        application.setFollowUpDate(request.followUpDate());

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