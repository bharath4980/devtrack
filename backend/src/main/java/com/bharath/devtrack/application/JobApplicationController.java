package com.bharath.devtrack.application;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpHeaders;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import com.bharath.devtrack.auth.AccountService;

@RestController
@RequestMapping("/api/applications")
public class JobApplicationController {

    private final JobApplicationService service;
    private final ApplicationActivityService activity;
    private final AccountService accounts;
    private final ApplicationImportService importer;

    public JobApplicationController(JobApplicationService service, ApplicationActivityService activity,
                                    AccountService accounts, ApplicationImportService importer) {
        this.service = service;
        this.activity = activity;
        this.accounts = accounts;
        this.importer = importer;
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

    @GetMapping("/duplicate")
    public ResponseEntity<JobApplicationService.DuplicateMatch> findDuplicate(
            Principal principal,
            @RequestParam String url,
            @RequestParam(required = false) Long excludeId
    ) {
        JobApplicationService.DuplicateMatch match =
                service.findDuplicate(accounts.currentUser(principal).getId(), url, excludeId);
        if (match == null) {
            return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(match);
    }

    @PostMapping("/import")
    public ResponseEntity<ApplicationImportService.ImportResult> importApplications(
            Principal principal, @RequestBody ApplicationImportService.ImportRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(importer.importRows(accounts.currentUser(principal), request));
    }

    @GetMapping("/export.csv")
    public ResponseEntity<byte[]> exportCsv(Principal principal) {
        byte[] content = service.exportCsv(accounts.currentUser(principal).getId());
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("text/csv;charset=UTF-8"))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"devtrack-applications.csv\"")
                .header("X-Content-Type-Options", "nosniff")
                .cacheControl(CacheControl.noStore())
                .body(content);
    }

    @PatchMapping("/{id}/follow-up/complete")
    public JobApplication completeFollowUp(Principal principal, @PathVariable Long id) {
        return service.completeFollowUp(accounts.currentUser(principal).getId(), id);
    }

    public record RescheduleFollowUpRequest(@NotNull LocalDate followUpDate) {}

    @PatchMapping("/{id}/follow-up")
    public JobApplication rescheduleFollowUp(
            Principal principal, @PathVariable Long id,
            @Valid @RequestBody RescheduleFollowUpRequest request
    ) {
        return service.rescheduleFollowUp(accounts.currentUser(principal).getId(), id, request.followUpDate());
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

    @GetMapping("/{id}")
    public JobApplication findOne(Principal principal, @PathVariable Long id) {
        return service.getForOwner(accounts.currentUser(principal).getId(), id);
    }

    @GetMapping("/{id}/activity")
    public java.util.List<ApplicationActivityResponse> getActivity(Principal principal, @PathVariable Long id) {
        return activity.getForApplication(accounts.currentUser(principal).getId(), id);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(Principal principal, @PathVariable Long id) {
        service.delete(accounts.currentUser(principal).getId(), id);
    }
}

