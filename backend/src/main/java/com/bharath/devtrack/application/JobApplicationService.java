package com.bharath.devtrack.application;

import com.bharath.devtrack.auth.UserAccount;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import org.springframework.data.domain.PageRequest;
import java.nio.charset.StandardCharsets;
import java.net.URI;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Locale;
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

    public record DuplicateMatch(Long id, String company, String title, ApplicationStatus status) {}

    /**
     * A read-only, owner-scoped duplicate hint. Queries only URLs on the same host,
     * then compares the normalized posting identity without fetching any remote page.
     * Saving a duplicate remains an explicit user choice, not a database constraint.
     */
    @Transactional(readOnly = true)
    public DuplicateMatch findDuplicate(Long ownerId, String url, Long excludeId) {
        PostingKey requested = postingKey(url);
        String host = requested.host();
        for (JobApplication existing : repository.findDuplicateCandidates(
                ownerId, "http://" + host + "%", "https://" + host + "%")) {
            if (excludeId != null && excludeId.equals(existing.getId())) continue;
            try {
                if (requested.value().equals(postingKey(existing.getPostingUrl()).value())) {
                    return new DuplicateMatch(existing.getId(), existing.getCompany(),
                            existing.getTitle(), existing.getStatus());
                }
            } catch (ResponseStatusException ignored) {
                // Old or malformed stored URLs cannot be used as duplicate identities.
            }
        }
        return null;
    }

    private record PostingKey(String host, String value) {}

    private static PostingKey postingKey(String url) {
        if (url == null || url.isBlank() || url.length() > 255) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter a valid job posting URL.");
        }
        URI uri;
        try {
            uri = URI.create(url.trim()).normalize();
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter a valid job posting URL.");
        }
        String scheme = uri.getScheme();
        if (scheme == null || (!scheme.equalsIgnoreCase("https") && !scheme.equalsIgnoreCase("http"))
                || uri.getHost() == null || uri.getUserInfo() != null
                || uri.getPort() < -1 || uri.getPort() > 65535) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter a valid job posting URL.");
        }
        String host = uri.getHost().toLowerCase(Locale.ROOT);
        String path = uri.getRawPath() == null ? "" : uri.getRawPath();
        while (path.endsWith("/")) path = path.substring(0, path.length() - 1);

        boolean pathBasedBoard = host.equals("boards.greenhouse.io")
                || host.equals("job-boards.greenhouse.io")
                || host.equals("jobs.lever.co") || host.equals("jobs.ashbyhq.com")
                || host.equals("jobs.smartrecruiters.com") || host.equals("www.smartrecruiters.com")
                || host.matches("[a-z0-9-]+\\.wd[0-9]{1,3}\\.myworkdayjobs\\.com")
                || host.matches("[a-z0-9-]+\\.bamboohr\\.com");
        ArrayList<String> functionalParams = new ArrayList<>();
        if (!pathBasedBoard && uri.getRawQuery() != null) {
            for (String part : uri.getRawQuery().split("&")) {
                String key = part.split("=", 2)[0].toLowerCase(Locale.ROOT);
                if (!part.isBlank() && !key.startsWith("utm_")
                        && !java.util.Set.of("source", "src", "ref", "referrer",
                                "gclid", "fbclid", "igshid", "mc_cid", "mc_eid").contains(key)) {
                    functionalParams.add(part);
                }
            }
        }
        Collections.sort(functionalParams);
        String query = functionalParams.isEmpty() ? "" : "?" + String.join("&", functionalParams);
        String port = uri.getPort() == -1 || uri.getPort() == 80 || uri.getPort() == 443
                ? "" : ":" + uri.getPort();
        return new PostingKey(host, host + port + path + query);
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