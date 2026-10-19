package com.bharath.devtrack.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class JobPostingPreviewService {
    private static final int MAX_BODY_BYTES = 256 * 1024;
    private static final int MAX_ASHBY_BODY_BYTES = 2 * 1024 * 1024;
    private static final Pattern GREENHOUSE_PATH = Pattern.compile(
            "^/([a-zA-Z0-9_-]{1,80})/jobs/([0-9]{1,20})/?$");
    private static final Pattern LEVER_PATH = Pattern.compile(
            "^/([a-zA-Z0-9_-]{1,80})/([a-zA-Z0-9-]{8,80})/?$");
    private static final Pattern ASHBY_PATH = Pattern.compile(
            "^/([a-zA-Z0-9_-]{1,80})/([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})(?:/application)?/?$");
    private static final Pattern SMARTRECRUITERS_PATH = Pattern.compile(
            "^/([a-zA-Z0-9_-]{1,80})/([0-9]{6,20})(?:-[a-zA-Z0-9_-]{1,120})?/?$");

    private final ObjectMapper mapper;
    private final HttpClient client;

    @org.springframework.beans.factory.annotation.Autowired
    public JobPostingPreviewService(ObjectMapper mapper) {
        this(mapper, HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(3))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build());
    }

    JobPostingPreviewService(ObjectMapper mapper, HttpClient client) {
        this.mapper = mapper;
        this.client = client;
    }

    public JobPostingPreview preview(String postingUrl) {
        if (postingUrl == null || postingUrl.isBlank() || postingUrl.length() > 255) {
            throw invalidUrl();
        }

        URI source;
        try {
            source = URI.create(postingUrl.trim());
        } catch (IllegalArgumentException exception) {
            throw invalidUrl();
        }

        if (!"https".equalsIgnoreCase(source.getScheme())
                || source.getHost() == null || source.getUserInfo() != null
                || source.getPort() != -1 || source.getFragment() != null) {
            throw invalidUrl();
        }

        String host = source.getHost().toLowerCase(java.util.Locale.ROOT);
        String path = source.getRawPath();
        Matcher greenhouse = GREENHOUSE_PATH.matcher(path == null ? "" : path);
        Matcher lever = LEVER_PATH.matcher(path == null ? "" : path);
        Matcher ashby = ASHBY_PATH.matcher(path == null ? "" : path);
        Matcher smartRecruiters = SMARTRECRUITERS_PATH.matcher(path == null ? "" : path);

        boolean isGreenhouse = (host.equals("boards.greenhouse.io")
                || host.equals("job-boards.greenhouse.io")) && greenhouse.matches();
        boolean isLever = host.equals("jobs.lever.co") && lever.matches();
        boolean isAshby = host.equals("jobs.ashbyhq.com") && ashby.matches();
        boolean isSmartRecruiters = (host.equals("jobs.smartrecruiters.com")
                || host.equals("www.smartrecruiters.com")) && smartRecruiters.matches();
        if (!isGreenhouse && !isLever && !isAshby && !isSmartRecruiters) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Automatic import supports Greenhouse, Lever, Ashby, and SmartRecruiters job links. Enter details manually for other sites.");
        }

        String companySlug = isGreenhouse ? greenhouse.group(1)
                : isLever ? lever.group(1) : isAshby ? ashby.group(1) : smartRecruiters.group(1);
        String jobId = isGreenhouse ? greenhouse.group(2)
                : isLever ? lever.group(2) : isAshby ? ashby.group(2) : smartRecruiters.group(2);

        // Only contact fixed public ATS API hosts using validated board and job identifiers.
        // Never fetch the user-supplied URL or follow provider redirects.
        URI endpoint = URI.create(isGreenhouse
                ? "https://boards-api.greenhouse.io/v1/boards/" + companySlug + "/jobs/" + jobId
                : isLever ? "https://api.lever.co/v0/postings/" + companySlug + "/" + jobId
                : isAshby ? "https://api.ashbyhq.com/posting-api/job-board/" + companySlug
                : "https://api.smartrecruiters.com/v1/companies/" + companySlug + "/postings/" + jobId);

        HttpRequest request = HttpRequest.newBuilder(endpoint)
                .timeout(Duration.ofSeconds(5))
                .header("Accept", "application/json")
                .GET().build();

        try {
            HttpResponse<InputStream> response = client.send(
                    request, HttpResponse.BodyHandlers.ofInputStream());
            try (InputStream stream = response.body()) {
                if (response.statusCode() != 200) {
                    throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                            "Job details are unavailable. Check the link or enter the details manually.");
                }
                int limit = isAshby ? MAX_ASHBY_BODY_BYTES : MAX_BODY_BYTES;
                byte[] bytes = stream.readNBytes(limit + 1);
                if (bytes.length > limit) {
                    throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                            "Job posting response was too large. Enter details manually.");
                }

                JsonNode data = mapper.readTree(bytes);
                JsonNode posting = isAshby ? findAshbyPosting(data, companySlug, jobId) : data;
                if (isSmartRecruiters) {
                    // The public detail endpoint must return the requested company and posting.
                    String returnedId = text(posting.path("id"));
                    String returnedCompany = text(posting.path("company").path("identifier"));
                    if (!jobId.equals(returnedId)
                            || (!returnedCompany.isEmpty()
                                    && !companySlug.equalsIgnoreCase(returnedCompany))) {
                        throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                                "The requested job is not available. Enter details manually.");
                    }
                }
                String title = text(isSmartRecruiters ? posting.path("name")
                        : isAshby ? posting.path("title")
                        : isGreenhouse ? posting.path("title") : posting.path("text"));
                String location = isSmartRecruiters
                        ? smartRecruitersLocation(posting.path("location"))
                        : text(isAshby ? posting.path("location")
                        : isGreenhouse ? posting.path("location").path("name")
                        : posting.path("categories").path("location"));
                if (title.isEmpty()) {
                    throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                            "Job details could not be read. Enter them manually.");
                }

                String company = isSmartRecruiters ? text(posting.path("company").path("name")) : "";
                return new JobPostingPreview(company.isEmpty() ? displayName(companySlug) : company,
                        title, location);
            }
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Could not reach the job board. Enter details manually.");
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Job lookup was interrupted. Try again or enter details manually.");
        }
    }

    private static String smartRecruitersLocation(JsonNode location) {
        String city = text(location.path("city"));
        String region = text(location.path("region"));
        String country = text(location.path("country"));
        String place = !city.isEmpty()
                ? city + (region.isEmpty() ? "" : ", " + region)
                : !region.isEmpty() ? region : country;
        String value = location.path("remote").asBoolean(false)
                ? place.isEmpty() ? "Remote" : "Remote - " + place
                : place;
        return value.length() > 255 ? value.substring(0, 255) : value;
    }

    private static JsonNode findAshbyPosting(JsonNode data, String board, String jobId) {
        JsonNode jobs = data.path("jobs");
        if (jobs.isArray()) {
            for (JsonNode posting : jobs) {
                if (jobId.equalsIgnoreCase(text(posting.path("id")))) {
                    return posting;
                }
                String jobUrl = text(posting.path("jobUrl"));
                try {
                    URI uri = URI.create(jobUrl);
                    Matcher match = ASHBY_PATH.matcher(uri.getRawPath() == null ? "" : uri.getRawPath());
                    if ("https".equalsIgnoreCase(uri.getScheme())
                            && "jobs.ashbyhq.com".equalsIgnoreCase(uri.getHost())
                            && match.matches()
                            && board.equalsIgnoreCase(match.group(1))
                            && jobId.equalsIgnoreCase(match.group(2))) {
                        return posting;
                    }
                } catch (IllegalArgumentException ignored) {
                    // Ignore malformed provider records; no URLs from this response are fetched.
                }
            }
        }
        throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                "This Ashby job is not available on its public board. Enter details manually.");
    }

    private static String text(JsonNode node) {
        String value = node.isTextual() ? node.asText().replaceAll("\\s+", " ").trim() : "";
        return value.length() > 255 ? value.substring(0, 255) : value;
    }

    private static String displayName(String slug) {
        String[] words = slug.replace('_', ' ').replace('-', ' ').trim().split(" +");
        StringBuilder result = new StringBuilder();
        for (String word : words) {
            if (result.length() > 0) result.append(' ');
            result.append(Character.toUpperCase(word.charAt(0))).append(word.substring(1));
        }
        return result.toString();
    }

    private static ResponseStatusException invalidUrl() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Enter a valid HTTPS job posting link.");
    }
}
