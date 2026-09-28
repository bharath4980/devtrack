package com.bharath.devtrack;

import com.bharath.devtrack.application.JobApplicationRepository;
import com.bharath.devtrack.auth.UserAccount;
import com.bharath.devtrack.auth.UserAccountRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:errorhandling;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password="
})
@AutoConfigureMockMvc
class ApiErrorHandlingTest {

    private static final String PASSWORD =
            "correct-horse-battery";

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper json;

    @Autowired
    UserAccountRepository users;

    @Autowired
    JobApplicationRepository applications;

    @Autowired
    PasswordEncoder encoder;

    UserAccount user;

    @BeforeEach
    void setUp() {
        applications.deleteAll();
        users.deleteAll();

        user = users.save(
                new UserAccount(
                        "test@example.com",
                        encoder.encode(PASSWORD)
                )
        );
    }

    @Test
    void validationErrorsUseConsistentApiResponse()
            throws Exception {

        MockHttpSession session =
                login(user.getEmail());

        Csrf csrf = csrf(session);

        String invalidBody = """
                {
                  "company": "",
                  "title": "",
                  "location": "",
                  "postingUrl": "",
                  "notes": "",
                  "applicationDate": null
                }
                """;

        mvc.perform(
                        post("/api/applications")
                                .session(session)
                                .header(
                                        csrf.header(),
                                        csrf.token()
                                )
                                .contentType(
                                        MediaType.APPLICATION_JSON
                                )
                                .content(invalidBody)
                )
                .andExpect(status().isBadRequest())
                .andExpect(
                        jsonPath("$.status")
                                .value(400)
                )
                .andExpect(
                        jsonPath("$.error")
                                .value("Bad Request")
                )
                .andExpect(
                        jsonPath("$.message")
                                .value("Validation failed")
                )
                .andExpect(
                        jsonPath("$.path")
                                .value("/api/applications")
                )
                .andExpect(
                        jsonPath("$.fieldErrors.company")
                                .exists()
                )
                .andExpect(
                        jsonPath("$.fieldErrors.title")
                                .exists()
                )
                .andExpect(
                        jsonPath("$.fieldErrors.applicationDate")
                                .exists()
                );
    }

    @Test
    void missingApplicationUsesConsistentNotFoundResponse()
            throws Exception {

        MockHttpSession session =
                login(user.getEmail());

        Csrf csrf = csrf(session);

        String body = """
                {
                  "company": "Acme",
                  "title": "Software Engineer",
                  "location": "Houston",
                  "postingUrl": "",
                  "notes": "",
                  "applicationDate": "2026-09-27",
                  "interviewDate": null
                }
                """;

        mvc.perform(
                        put("/api/applications/999999")
                                .session(session)
                                .header(
                                        csrf.header(),
                                        csrf.token()
                                )
                                .contentType(
                                        MediaType.APPLICATION_JSON
                                )
                                .content(body)
                )
                .andExpect(status().isNotFound())
                .andExpect(
                        jsonPath("$.status")
                                .value(404)
                )
                .andExpect(
                        jsonPath("$.error")
                                .value("Not Found")
                )
                .andExpect(
                        jsonPath("$.message")
                                .value("Application not found")
                )
                .andExpect(
                        jsonPath("$.path")
                                .value(
                                        "/api/applications/999999"
                                )
                );
    }

    @Test
    void unknownApiRouteRemainsNotFound()
            throws Exception {

        MockHttpSession session =
                login(user.getEmail());

        mvc.perform(
                        get("/api/env")
                                .session(session)
                )
                .andExpect(status().isNotFound())
                .andExpect(
                        jsonPath("$.status")
                                .value(404)
                )
                .andExpect(
                        jsonPath("$.error")
                                .value("Not Found")
                )
                .andExpect(
                        jsonPath("$.message")
                                .value("Resource not found")
                )
                .andExpect(
                        jsonPath("$.path")
                                .value("/api/env")
                );
    }

    private MockHttpSession login(String email)
            throws Exception {

        Csrf csrf =
                csrf(new MockHttpSession());

        mvc.perform(
                        post("/api/auth/login")
                                .session(csrf.session())
                                .header(
                                        csrf.header(),
                                        csrf.token()
                                )
                                .param("email", email)
                                .param(
                                        "password",
                                        PASSWORD
                                )
                )
                .andExpect(status().isNoContent());

        return csrf.session();
    }

    private Csrf csrf(MockHttpSession session)
            throws Exception {

        MvcResult result =
                mvc.perform(
                                get("/api/auth/csrf")
                                        .session(session)
                        )
                        .andExpect(status().isOk())
                        .andReturn();

        JsonNode token =
                json.readTree(
                        result.getResponse()
                                .getContentAsString()
                );

        return new Csrf(
                session,
                token.get("headerName").asText(),
                token.get("token").asText()
        );
    }

    private record Csrf(
            MockHttpSession session,
            String header,
            String token
    ) {
    }
}