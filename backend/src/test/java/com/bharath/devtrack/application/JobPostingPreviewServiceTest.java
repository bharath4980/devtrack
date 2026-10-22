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
    void importsSmartRecruitersFieldsFromPublicPostingApi() throws Exception {
        respond(200, """
                {"id":"744000133907678","name":"Backend Engineer",
                 "company":{"identifier":"Visa","name":"Visa Inc."},
                 "location":{"city":"Austin","region":"TX","country":"us","remote":false}}
                """);
        JobPostingPreview preview = service.preview(
                "https://jobs.smartrecruiters.com/Visa/744000133907678-backend-engineer?utm_source=careers");
        assertThat(preview).isEqualTo(
                new JobPostingPreview("Visa Inc.", "Backend Engineer", "Austin, TX"));
        assertRequest("https://api.smartrecruiters.com/v1/companies/Visa/postings/744000133907678");
    }

    @Test
    void acceptsSmartRecruitersLegacyHostAndRemoteOnlyLocation() throws Exception {
        respond(200, """
                {"id":"884352026","name":"Site Reliability Engineer",
                 "company":{"identifier":"ExampleCo"},
                 "location":{"remote":true}}
                """);
        JobPostingPreview preview = service.preview(
                "https://www.smartrecruiters.com/ExampleCo/884352026-site-reliability-engineer");
        assertThat(preview).isEqualTo(
                new JobPostingPreview("ExampleCo", "Site Reliability Engineer", "Remote"));
        assertRequest("https://api.smartrecruiters.com/v1/companies/ExampleCo/postings/884352026");
    }

    @Test
    void rejectsMismatchedSmartRecruitersResponses() throws Exception {
        respond(200, """
                {"id":"999999999","name":"Wrong posting",
                 "company":{"identifier":"ExampleCo","name":"ExampleCo"}}
                """);
        assertThatThrownBy(() -> service.preview(
                "https://jobs.smartrecruiters.com/ExampleCo/884352026-site-reliability-engineer"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(
                        ((ResponseStatusException) error).getStatusCode()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY));

        clearInvocations(client);
        respond(200, """
                {"id":"884352026","name":"Correct ID, wrong company",
                 "company":{"identifier":"OtherCo","name":"OtherCo"}}
                """);
        assertThatThrownBy(() -> service.preview(
                "https://jobs.smartrecruiters.com/ExampleCo/884352026-site-reliability-engineer"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(
                        ((ResponseStatusException) error).getStatusCode()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY));
    }

    @Test
    void requiresSmartRecruitersJobTitleAndFallsBackToManualEntry() throws Exception {
        respond(200, """
                {"id":"884352026","company":{"identifier":"ExampleCo"}}
                """);
        assertThatThrownBy(() -> service.preview(
                "https://jobs.smartrecruiters.com/ExampleCo/884352026"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(
                        ((ResponseStatusException) error).getStatusCode()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY));
    }

    @Test
    void smartRecruitersProviderFailureDoesNotLeakResponseDetails() throws Exception {
        respond(404, """
                {"internalSecret":"should not be displayed"}
                """);
        assertThatThrownBy(() -> service.preview(
                "https://jobs.smartrecruiters.com/ExampleCo/884352026"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageNotContaining("internalSecret");
    }

    @Test
    void importsWorkdayPostingFromItsPublicDetailEndpoint() throws Exception {
        respond(200, """
                {"jobPostingInfo":{"title":"Senior Platform Engineer",
                "location":"Santa Clara, California, United States",
                "jobReqId":"JR102030","jobDescription":"<p>Do not copy this HTML.</p>"}}
                """);
        JobPostingPreview preview = service.preview(
                "https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite"
                + "/job/US-CA-Santa-Clara/Senior-Platform-Engineer_JR102030?source=careers");
        assertThat(preview).isEqualTo(new JobPostingPreview(
                "Nvidia", "Senior Platform Engineer", "Santa Clara, California, United States"));
        assertRequest("https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia"
                + "/NVIDIAExternalCareerSite/job/US-CA-Santa-Clara/Senior-Platform-Engineer_JR102030");
    }

    @Test
    void importsWorkdayPostingWithoutLocaleOrLocationPath() throws Exception {
        respond(200, """
                {"jobPostingInfo":{"title":"Software Developer", "location":"Remote"}}
                """);
        JobPostingPreview preview = service.preview(
                "https://example-company.wd12.myworkdayjobs.com/External/job/Software-Developer_R12345");
        assertThat(preview).isEqualTo(
                new JobPostingPreview("Example Company", "Software Developer", "Remote"));
        assertRequest("https://example-company.wd12.myworkdayjobs.com/wday/cxs/"
                + "example-company/External/job/Software-Developer_R12345");
    }

    @Test
    void rejectsUnavailableAndMalformedWorkdayResponses() throws Exception {
        respond(200, """
                {"jobPostingInfo":{"location":"Remote","jobDescription":"HTML without a title"}}
                """);
        assertThatThrownBy(() -> service.preview(
                "https://acme.wd1.myworkdayjobs.com/en-US/External/job/Remote/Backend_R1234"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(
                        ((ResponseStatusException) error).getStatusCode())
                        .isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY));

        clearInvocations(client);
        respond(302, "The posting moved to a non-Workday host.");
        assertThatThrownBy(() -> service.preview(
                "https://acme.wd1.myworkdayjobs.com/en-US/External/job/Remote/Backend_R1234"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageNotContaining("non-Workday");
    }

    @Test
    void refusesOversizedWorkdayDetailResponse() throws Exception {
        respond(200, "A".repeat(512 * 1024 + 1));
        assertThatThrownBy(() -> service.preview(
                "https://acme.wd1.myworkdayjobs.com/en-US/External/job/Remote/Backend_R1234"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(
                        ((ResponseStatusException) error).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_GATEWAY));
    }

    @Test
    void rejectsUnsafeWorkdayUrlsWithoutNetworkRequests() {
        for (String url : new String[]{
                "http://acme.wd1.myworkdayjobs.com/External/job/Remote/Backend_R1234",
                "https://acme.wd1.myworkdayjobs.com.evil.test/External/job/Remote/Backend_R1234",
                "https://acme.wd1.myworkdayjobs.com@127.0.0.1/External/job/Remote/Backend_R1234",
                "https://acme.wd1.myworkdayjobs.com:443/External/job/Remote/Backend_R1234",
                "https://acme.wd1.myworkdayjobs.com/External/job/Remote/Backend_R1234#details",
                "https://acme.wd1.myworkdayjobs.com/External/job/Remote/Backend%2Fadmin",
                "https://acme.wd1.myworkdayjobs.com/External/job/Remote/../admin",
                "https://acme.wd1.myworkdayjobs.com/External/job",
                "https://acme.wd1.myworkdayjobs.com/External/job/Remote/Backend_R1234/edit",
                "https://acme.wd1.myworkdayjobs.com/wday/cxs/acme/External/job/Remote/Backend_R1234",
                "https://acme.wd1.myworkdayjobs.com/External/job/Remote/Backend_R1234%2e",
                "https://other.example.com/External/job/Remote/Backend_R1234"
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
    void importsBamboohrPostingFromPublicCareersDetail() throws Exception {
        respond(200, """
                {"result":{"jobOpening":{"jobOpeningName":"Infrastructure Ops Engineer",
                  "jobOpeningShareUrl":"https://flyio.bamboohr.com/careers/35",
                  "location":{"city":"Chicago","state":"Illinois","addressCountry":"United States"},
                  "locationType":0}}}
                """);
        JobPostingPreview preview = service.preview(
                "https://flyio.bamboohr.com/careers/35?source=company-careers");
        assertThat(preview).isEqualTo(
                new JobPostingPreview("Flyio", "Infrastructure Ops Engineer", "Chicago, Illinois"));
        assertRequest("https://flyio.bamboohr.com/careers/35/detail");
    }

    @Test
    void importsExplicitRemoteAndStructuredBamboohrLocations() throws Exception {
        respond(200, """
                {"result":{"jobOpening":{"jobOpeningName":"Software Engineer",
                  "isRemote":true,"locationType":"1",
                  "location":{"city":null,"state":null}}}}
                """);
        assertThat(service.preview("https://acme-company.bamboohr.com/careers/124"))
                .isEqualTo(new JobPostingPreview("Acme Company", "Software Engineer", "Remote"));
        assertRequest("https://acme-company.bamboohr.com/careers/124/detail");

        clearInvocations(client);
        respond(200, """
                {"result":{"jobOpening":{"jobOpeningName":"IT Administrator",
                  "locationType":2,"location":{"city":"Austin","state":"TX"}}}}
                """);
        assertThat(service.preview("https://acme-company.bamboohr.com/careers/125/"))
                .isEqualTo(new JobPostingPreview("Acme Company", "IT Administrator", "Austin, TX"));
        assertRequest("https://acme-company.bamboohr.com/careers/125/detail");

        clearInvocations(client);
        respond(200, """
                {"result":{"jobOpening":{"jobOpeningName":"Developer",
                  "locationType":1,"location":{"city":null,"state":null},
                  "atsLocation":{"city":"Toronto","province":"Ontario","country":"Canada"}}}}
                """);
        assertThat(service.preview("https://acme-company.bamboohr.com/careers/126"))
                .isEqualTo(new JobPostingPreview("Acme Company", "Developer", "Toronto, Ontario"));
        assertRequest("https://acme-company.bamboohr.com/careers/126/detail");
    }

    @Test
    void rejectsBamboohrResponseForDifferentPosting() throws Exception {
        respond(200, """
                {"result":{"jobOpening":{"jobOpeningName":"Wrong Job",
                  "jobOpeningShareUrl":"https://flyio.bamboohr.com/careers/99"}}}
                """);
        assertThatThrownBy(() -> service.preview("https://flyio.bamboohr.com/careers/35"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode())
                        .isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY));

        clearInvocations(client);
        respond(200, """
                {"result":{"jobOpening":{"jobOpeningName":"Wrong Company",
                  "jobOpeningShareUrl":"https://other.bamboohr.com/careers/35"}}}
                """);
        assertThatThrownBy(() -> service.preview("https://flyio.bamboohr.com/careers/35"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode())
                        .isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY));
    }

    @Test
    void requiresBamboohrTitleAndHandlesUnavailablePosts() throws Exception {
        respond(200, """
                {"result":{"jobOpening":{"location":{"city":"Austin"}}}}
                """);
        assertThatThrownBy(() -> service.preview("https://flyio.bamboohr.com/careers/35"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode())
                        .isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY));

        clearInvocations(client);
        respond(404, """
                {"internalSecret":"provider unavailable"}
                """);
        assertThatThrownBy(() -> service.preview("https://flyio.bamboohr.com/careers/35"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageNotContaining("internalSecret");
    }

    @Test
    void refusesOversizedBamboohrDetailResponse() throws Exception {
        respond(200, "A".repeat(256 * 1024 + 1));
        assertThatThrownBy(() -> service.preview("https://flyio.bamboohr.com/careers/35"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_GATEWAY));
    }

    @Test
    void rejectsUnsafeBamboohrUrlsWithoutMakingNetworkRequests() {
        for (String url : new String[]{
                "http://flyio.bamboohr.com/careers/35",
                "https://flyio.bamboohr.com.evil.test/careers/35",
                "https://flyio.bamboohr.com@127.0.0.1/careers/35",
                "https://flyio.bamboohr.com:443/careers/35",
                "https://flyio.bamboohr.com/careers/35#jobs",
                "https://flyio.bamboohr.com/careers/%33%35",
                "https://flyio.bamboohr.com/careers/35/detail",
                "https://flyio.bamboohr.com/careers/35/extra",
                "https://flyio.bamboohr.com/careers/35/../99",
                "https://flyio.bamboohr.com/careers/list",
                "https://.bamboohr.com/careers/35",
                "https://flyio.bamboohr.com/careers/35%2Fdetail",
                "https://flyio.bamboohr.com/careers/35?source=ok#unsafe"
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
                "http://jobs.smartrecruiters.com/ExampleCo/884352026-sre",
                "https://jobs.smartrecruiters.com.evil.test/ExampleCo/884352026-sre",
                "https://jobs.smartrecruiters.com@127.0.0.1/ExampleCo/884352026-sre",
                "https://jobs.smartrecruiters.com:443/ExampleCo/884352026-sre",
                "https://jobs.smartrecruiters.com/ExampleCo/884352026%2Fadmin",
                "https://jobs.smartrecruiters.com/ExampleCo/../../admin",
                "https://jobs.smartrecruiters.com/ExampleCo/not-a-posting",
                "https://jobs.smartrecruiters.com/ExampleCo/884352026-sre/extra",
                "https://jobs.smartrecruiters.com/ExampleCo/884352026-sre#fragment",
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
