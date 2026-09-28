package com.bharath.devtrack.application;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import com.bharath.devtrack.auth.AccountService;

@RestController
@RequestMapping("/api/applications")
public class JobApplicationController {

    private final JobApplicationService service;
    private final AccountService accounts;

    public JobApplicationController(JobApplicationService service, AccountService accounts) {
        this.service = service;
        this.accounts = accounts;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public JobApplication create(
            Principal principal,
            @Valid @RequestBody CreateJobApplicationRequest request
    ) {
        return service.create(accounts.currentUser(principal), request);
    }

    @GetMapping
    public ApplicationPage findAll(
            Principal principal,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) ApplicationStatus status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(defaultValue = "NEWEST") ApplicationSort sort
    ) {
        return service.findAll(accounts.currentUser(principal).getId(), search, status, page, size, sort);
    }

    @PatchMapping("/{id}/status")
    public JobApplication updateStatus(
            Principal principal,
            @PathVariable Long id,
            @Valid @RequestBody UpdateApplicationStatusRequest request
    ) {
        return service.updateStatus(accounts.currentUser(principal).getId(), id, request);
    }

    @PutMapping("/{id}")
    public JobApplication update(
            Principal principal,
            @PathVariable Long id,
            @Valid @RequestBody UpdateJobApplicationRequest request
    ) {
        return service.update(accounts.currentUser(principal).getId(), id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(Principal principal, @PathVariable Long id) {
        service.delete(accounts.currentUser(principal).getId(), id);
    }
}

