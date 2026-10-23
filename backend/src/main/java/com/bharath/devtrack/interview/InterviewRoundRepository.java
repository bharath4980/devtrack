package com.bharath.devtrack.interview;

import java.util.List;
import java.util.Optional;
import java.time.LocalDate;
import java.util.Collection;
import com.bharath.devtrack.application.ApplicationStatus;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InterviewRoundRepository extends JpaRepository<InterviewRound, Long> {
    List<InterviewRound> findByApplicationIdAndOwnerIdOrderByIdAsc(Long applicationId, Long ownerId);
    Optional<InterviewRound> findByIdAndApplicationIdAndOwnerId(Long id, Long applicationId, Long ownerId);
    long countByApplicationIdAndOwnerId(Long applicationId, Long ownerId);

    // Read only scheduled, planned rounds on active applications belonging to this account.
    @Query("""
            SELECT round, application.company, application.title
            FROM InterviewRound round, JobApplication application
            WHERE round.applicationId = application.id
              AND round.ownerId = :ownerId
              AND application.owner.id = :ownerId
              AND application.status IN :activeStatuses
              AND round.outcome = :outcome
              AND round.scheduledDate >= :today
            ORDER BY round.scheduledDate ASC, round.id ASC
            """)
    List<Object[]> findDashboardUpcoming(
            @Param("ownerId") Long ownerId,
            @Param("activeStatuses") Collection<ApplicationStatus> activeStatuses,
            @Param("outcome") InterviewRound.Outcome outcome,
            @Param("today") LocalDate today,
            Pageable limit);
}
