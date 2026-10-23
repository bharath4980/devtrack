package com.bharath.devtrack.application;

import com.bharath.devtrack.auth.UserAccount;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * The browser previews CSV files. This endpoint validates every field again and
 * performs one atomic import; a failed row must never partially write a batch.
 */
@Service
public class ApplicationImportService {
    private static final int MAX_IMPORT_ROWS = 100;
    private final JobApplicationRepository repository;
    private final JobApplicationService applications;
    private final ApplicationActivityService activity;

    public ApplicationImportService(JobApplicationRepository repository,
                                    JobApplicationService applications,
                                    ApplicationActivityService activity) {
        this.repository = repository;
        this.applications = applications;
        this.activity = activity;
    }

    public record ImportRequest(List<ImportRow> rows) {}
    public record ImportRow(String company, String title, String location, String status,
                            String applicationDate, String interviewDate, String followUpDate,
                            String postingUrl, String notes) {}
    public record ImportResult(int imported) {}

    @Transactional
    public ImportResult importRows(UserAccount owner, ImportRequest request) {
        if (request == null || request.rows() == null
                || request.rows().isEmpty() || request.rows().size() > MAX_IMPORT_ROWS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Import 1 to 100 applications at a time.");
        }
        Set<String> seenKeys = new HashSet<>();
        List<JobApplication> pending = new java.util.ArrayList<>();

        for (int i = 0; i < request.rows().size(); i++) {
            ImportRow row = request.rows().get(i);
            int number = i + 1;
            if (row == null) fail(number, "Row is empty");
            String company = required(row.company(), 255, number, "company");
            String title = required(row.title(), 255, number, "title");
            String location = optional(row.location(), 255, number, "location");
            String url = optional(row.postingUrl(), 255, number, "posting URL");
            String notes = optional(row.notes(), 2000, number, "notes");
            ApplicationStatus status;
            try {
                status = row.status() == null || row.status().isBlank()
                        ? ApplicationStatus.SAVED
                        : ApplicationStatus.valueOf(row.status().trim().toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException error) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Row " + number + ": Invalid status. Use SAVED, APPLIED, INTERVIEW, OFFER or REJECTED.");
            }
            LocalDate applicationDate = date(row.applicationDate(), number, "application date");
            LocalDate interviewDate = date(row.interviewDate(), number, "interview date");
            LocalDate followUpDate = date(row.followUpDate(), number, "follow-up date");

            String duplicateKey;
            if (url != null) {
                JobApplicationService.PostingKey posting = JobApplicationService.postingKey(url);
                duplicateKey = "url:" + posting.value();
                if (applications.findDuplicate(owner.getId(), url, null) != null) {
                    fail(number, "This job posting URL already exists in your account");
                }
            } else {
                // Conservative no-URL identity, scoped to owner and application day.
                duplicateKey = "manual:" + company.toLowerCase(Locale.ROOT) + "|"
                        + title.toLowerCase(Locale.ROOT) + "\u0000" + applicationDate;
                if (repository.existsByOwner_IdAndCompanyIgnoreCaseAndTitleIgnoreCaseAndApplicationDate(
                        owner.getId(), company, title, applicationDate)) {
                    fail(number, "This company, job title and application date already exist");
                }
            }
            if (!seenKeys.add(duplicateKey)) {
                fail(number, "Duplicate application within the selected CSV file");
            }

            JobApplication application = new JobApplication();
            application.setOwner(owner);
            application.setCompany(company);
            application.setTitle(title);
            application.setLocation(location);
            application.setPostingUrl(url);
            application.setNotes(notes);
            application.setStatus(status);
            application.setApplicationDate(applicationDate);
            application.setInterviewDate(interviewDate);
            application.setFollowUpDate(followUpDate);
            pending.add(application);
        }

        // Activity events describe creation at the imported status, never fabricated transitions.
        for (JobApplication application : pending) {
            JobApplication saved = repository.save(application);
            activity.recordCreated(saved, owner);
        }
        return new ImportResult(pending.size());
    }

    private static String required(String text, int max, int row, String field) {
        String result = optional(text, max, row, field);
        if (result == null) fail(row, field + " is required");
        return result;
    }

    private static String optional(String text, int max, int row, String field) {
        if (text == null || text.isBlank()) return null;
        String value = text.trim();
        if (value.length() > max) fail(row, field + " exceeds " + max + " characters");
        return value;
    }

    private static LocalDate date(String raw, int row, String field) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return LocalDate.parse(raw.trim());
        } catch (DateTimeParseException e) {
            fail(row, field + " must use YYYY-MM-DD");
            return null;
        }
    }

    private static void fail(int row, String message) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Row " + row + ": " + message + ".");
    }
}
