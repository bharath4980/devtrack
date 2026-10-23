package com.bharath.devtrack.interview;

import com.bharath.devtrack.auth.AccountService;
import jakarta.validation.Valid;
import java.security.Principal;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/applications/{applicationId}/interviews")
public class InterviewRoundController {
    private final InterviewRoundService service;
    private final AccountService accounts;

    public InterviewRoundController(InterviewRoundService service, AccountService accounts) {
        this.service = service;
        this.accounts = accounts;
    }

    @GetMapping
    public ResponseEntity<List<InterviewRoundService.RoundDetails>> list(
            Principal principal, @PathVariable Long applicationId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(service.list(accounts.currentUser(principal).getId(), applicationId));
    }

    @PostMapping
    public ResponseEntity<InterviewRoundService.RoundDetails> create(
            Principal principal, @PathVariable Long applicationId,
            @Valid @RequestBody InterviewRoundRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore())
                .body(service.create(accounts.currentUser(principal).getId(), applicationId, request));
    }

    @PutMapping("/{roundId}")
    public ResponseEntity<InterviewRoundService.RoundDetails> update(
            Principal principal, @PathVariable Long applicationId, @PathVariable Long roundId,
            @Valid @RequestBody InterviewRoundRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(service.update(accounts.currentUser(principal).getId(), applicationId, roundId, request));
    }

    @DeleteMapping("/{roundId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(Principal principal, @PathVariable Long applicationId, @PathVariable Long roundId) {
        service.delete(accounts.currentUser(principal).getId(), applicationId, roundId);
    }
}
