package com.bharath.devtrack.application;

import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Pageable;
import org.springframework.web.server.ResponseStatusException;

import java.util.Collections;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class ApplicationCsvServiceTest {
    @Test
    void refusesOversizedExportInsteadOfSilentlyTruncating() {
        JobApplicationRepository repository = mock(JobApplicationRepository.class);
        ApplicationActivityService activity = mock(ApplicationActivityService.class);
        when(repository.findByOwner_IdOrderByIdAsc(eq(42L), any(Pageable.class)))
                .thenReturn(Collections.nCopies(10_001, new JobApplication()));

        JobApplicationService service = new JobApplicationService(repository, activity);
        assertThatThrownBy(() -> service.exportCsv(42L))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(
                        ((ResponseStatusException) error).getStatusCode().value()).isEqualTo(413));
        verify(repository).findByOwner_IdOrderByIdAsc(eq(42L), argThat(page ->
                page.getPageSize() == 10_001 && page.getPageNumber() == 0));
        verifyNoMoreInteractions(repository);
    }
}
