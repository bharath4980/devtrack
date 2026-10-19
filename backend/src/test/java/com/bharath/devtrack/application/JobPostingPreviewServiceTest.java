package com.bharath.devtrack.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class JobPostingPreviewServiceTest {
    private HttpClient client;
    private JobPostingPreviewService service;

    @BeforeEach
    void setup() {
        client = mock(HttpClient.class);
        service = new JobPostingPreviewService(new ObjectMapper(), client);
    }

    @Test
    void importsGreenhouseFieldsFromItsPublicApi() throws Exception {
        respond(200, """
                {"title":"Platform Engineer","location":{"name":"Remote - US"}}
                """);
        JobPostingPreview preview = service.preview(
                "https://job-boards.greenhouse.io/acme/jobs/1234567?gh_src=campaign");
        assertThat(preview).isEqualTo(new JobPostingPreview("Acme", "Platform Engineer", "Remote - US"));
        assertRequest("https://boards-api.greenhouse.io/v1/boards/acme/jobs/1234567");
    }

    @Test
    void importsLeverFieldsFromItsPublicApi() throws Exception {
        respond(200, """
                {"text":"Senior Software Engineer","categories":{"location":"New York"}}
                """);
        JobPostingPreview preview = service.preview(
                "https://jobs.lever.co/example-company/12345678-abcd-1234-abcd-123456789012");
        assertThat(preview).isEqualTo(new JobPostingPreview(
                "Example Company", "Senior Software Engineer", "New York"));
        assertRequest("https://api.lever.co/v0/postings/example-company/12345678-abcd-1234-abcd-123456789012");
    }

    @Test
    void importsMatchingAshbyPostingFromPublicBoard() throws Exception {
        respond(200, """
                {
                  "apiVersion": "1",
                  "jobs": [
                    {"id":"11111111-1111-1111-1111-111111111111","title":"Unrelated Role","location":"London"},
                    {"id":"22222222-2222-2222-2222-222222222222",
                     "title":"Backend Engineer","location":"Remote - US",
                     "jobUrl":"https://jobs.ashbyhq.com/acme/22222222-2222-2222-2222-222222222222"}
                  ]
                }
                """);
        JobPostingPreview preview = service.preview(
                "https://jobs.ashbyhq.com/acme/22222222-2222-2222-2222-222222222222?utm_campaign=careers");
        assertThat(preview).isEqualTo(new JobPostingPreview("Acme", "Backend Engineer", "Remote - US"));
        assertRequest("https://api.ashbyhq.com/posting-api/job-board/acme");
    }

    @Test
    void importsAshbyApplicationLinkUsingCanonicalJobUrl() throws Exception {
        respond(200, """
                {"jobs":[{"title":"Infrastructure Engineer","location":"Austin",
                "jobUrl":"https://jobs.ashbyhq.com/example-company/33333333-3333-3333-3333-333333333333"}]}
                """);
        JobPostingPreview preview = service.preview(
                "https://jobs.ashbyhq.com/example-company/33333333-3333-3333-3333-333333333333/application");
        assertThat(preview).isEqualTo(
                new JobPostingPreview("Example Company", "Infrastructure Engineer", "Austin"));
        assertRequest("https://api.ashbyhq.com/posting-api/job-board/example-company");
    }

    @Test
    void rejectsAshbyJobNotFoundOnThePublicBoard() throws Exception {
        respond(200, """
                {"jobs":[{"id":"11111111-1111-1111-1111-111111111111",
                "title":"Unrelated role","jobUrl":"https://jobs.ashbyhq.com/acme/11111111-1111-1111-1111-111111111111"}]}
                """);
        assertThatThrownBy(() -> service.preview(
                "https://jobs.ashbyhq.com/acme/22222222-2222-2222-2222-222222222222"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(
                        ((ResponseStatusException) error).getStatusCode()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY));
    }

    @Test
    void refusesOversizedAshbyBoardResponses() throws Exception {
        respond(200, "A".repeat(2 * 1024 * 1024 + 1));
        assertThatThrownBy(() -> service.preview(
                "https://jobs.ashbyhq.com/acme/22222222-2222-2222-2222-222222222222"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(
                        ((ResponseStatusException) error).getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY));
    }

    @Test
    void rejectsUnsafeAndUnsupportedUrlsWithoutMakingNetworkRequests() {
        for (String url : new String[]{
                "http://boards.greenhouse.io/acme/jobs/123",
                "https://localhost/acme/jobs/123",
                "https://127.0.0.1/acme/jobs/123",
                "https://boards.greenhouse.io.evil.test/acme/jobs/123",
                "https://boards.greenhouse.io@127.0.0.1/acme/jobs/123",
                "https://boards.greenhouse.io:443/acme/jobs/123",
                "https://boards.greenhouse.io/acme/jobs/%31%32%33",
                "https://jobs.lever.co/acme/../../admin",
                "http://jobs.ashbyhq.com/acme/22222222-2222-2222-2222-222222222222",
                "https://jobs.ashbyhq.com.evil.test/acme/22222222-2222-2222-2222-222222222222",
                "https://jobs.ashbyhq.com@127.0.0.1/acme/22222222-2222-2222-2222-222222222222",
                "https://jobs.ashbyhq.com:443/acme/22222222-2222-2222-2222-222222222222",
                "https://jobs.ashbyhq.com/acme/../../admin",
                "https://jobs.ashbyhq.com/acme/not-a-job-id",
                "https://jobs.ashbyhq.com/acme/22222222-2222-2222-2222-222222222222%2Fapplication",
                "https://example.com/jobs/123",
                "file:///etc/passwd"
        }) {
            assertThatThrownBy(() -> service.preview(url))
                    .as("Rejected: " + url)
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(error -> assertThat(
                            ((ResponseStatusException) error).getStatusCode().value()).isEqualTo(400));
        }
        verifyNoInteractions(client);
    }

    @Test
    void providerErrorsDoNotExposeRemoteResponseBodies() throws Exception {
        respond(404, "{\"secret\":\"provider internal details\"}");
        assertThatThrownBy(() -> service.preview("https://boards.greenhouse.io/acme/jobs/1234"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageNotContaining("provider internal details");
    }

    @Test
    void refusesOversizedProviderResponses() throws Exception {
        respond(200, "A".repeat(256 * 1024 + 1));
        assertThatThrownBy(() -> service.preview("https://boards.greenhouse.io/acme/jobs/1234"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(
                        ((ResponseStatusException) error).getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY));
    }

    @SuppressWarnings("unchecked")
    private void respond(int status, String body) throws Exception {
        HttpResponse<InputStream> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(status);
        when(response.body()).thenReturn(new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)));
        when(client.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenReturn(response);
    }

    private void assertRequest(String expected) throws Exception {
        ArgumentCaptor<HttpRequest> captured = ArgumentCaptor.forClass(HttpRequest.class);
        verify(client).send(captured.capture(), any(HttpResponse.BodyHandler.class));
        assertThat(captured.getValue().uri().toString()).isEqualTo(expected);
    }
}
