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
    private static final Pattern GREENHOUSE_PATH = Pattern.compile(
            "^/([a-zA-Z0-9_-]{1,80})/jobs/([0-9]{1,20})/?$");
    private static final Pattern LEVER_PATH = Pattern.compile(
            "^/([a-zA-Z0-9_-]{1,80})/([a-zA-Z0-9-]{8,80})/?$");

    private final ObjectMapper mapper;
    private final HttpClient client;

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

        boolean isGreenhouse = (host.equals("boards.greenhouse.io")
                || host.equals("job-boards.greenhouse.io")) && greenhouse.matches();
        boolean isLever = host.equals("jobs.lever.co") && lever.matches();
        if (!isGreenhouse && !isLever) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Automatic import supports Greenhouse and Lever job links. Enter details manually for other sites.");
        }

        String companySlug = isGreenhouse ? greenhouse.group(1) : lever.group(1);
        String jobId = isGreenhouse ? greenhouse.group(2) : lever.group(2);

        // Build outbound requests from fixed provider hosts and validated path segments.
        // Never fetch the supplied URL itself or follow provider redirects.
        URI endpoint = URI.create(isGreenhouse
                ? "https://boards-api.greenhouse.io/v1/boards/" + companySlug + "/jobs/" + jobId
                : "https://api.lever.co/v0/postings/" + companySlug + "/" + jobId);

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
                byte[] bytes = stream.readNBytes(MAX_BODY_BYTES + 1);
                if (bytes.length > MAX_BODY_BYTES) {
                    throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                            "Job posting response was too large. Enter details manually.");
                }

                JsonNode data = mapper.readTree(bytes);
                String title = text(isGreenhouse ? data.path("title") : data.path("text"));
                String location = text(isGreenhouse
                        ? data.path("location").path("name")
                        : data.path("categories").path("location"));
                if (title.isEmpty()) {
                    throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                            "Job details could not be read. Enter them manually.");
                }

                return new JobPostingPreview(displayName(companySlug), title, location);
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
