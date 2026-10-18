package com.bharath.devtrack.application;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/job-postings")
public class JobPostingPreviewController {
    private final JobPostingPreviewService service;

    public JobPostingPreviewController(JobPostingPreviewService service) {
        this.service = service;
    }

    @GetMapping("/preview")
    public JobPostingPreview preview(@RequestParam("url") String url) {
        return service.preview(url);
    }
}
