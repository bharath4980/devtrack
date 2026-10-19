package com.bharath.devtrack.application;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import java.util.List;
import java.util.Collection;
import java.util.Optional;

public interface JobApplicationRepository
        extends JpaRepository<JobApplication, Long> {

    Optional<JobApplication> findByIdAndOwner_Id(
            Long id,
            Long ownerId
    );

    long countByOwner_Id(Long ownerId);

    // Fetch one bounded, stable ID-ordered set for the owner's CSV export.
    List<JobApplication> findByOwner_IdOrderByIdAsc(Long ownerId, Pageable pageable);

    @Query("""
            select application.applicationDate from JobApplication application
            where application.owner.id = :ownerId
              and application.applicationDate between :startDate and :endDate
            """)
    List<LocalDate> findApplicationDatesForAnalytics(
            @Param("ownerId") Long ownerId,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate);

    long countByOwner_IdAndStatus(
            Long ownerId,
            ApplicationStatus status
    );

    long countByOwner_IdAndStatusInAndFollowUpDateBefore(
            Long ownerId, Collection<ApplicationStatus> statuses, LocalDate date);

    long countByOwner_IdAndStatusInAndFollowUpDate(
            Long ownerId, Collection<ApplicationStatus> statuses, LocalDate date);

    List<JobApplication>
    findTop5ByOwner_IdAndStatusAndInterviewDateGreaterThanEqualOrderByInterviewDateAsc(
            Long ownerId,
            ApplicationStatus status,
            LocalDate date
    );

    List<JobApplication> findTop5ByOwner_IdAndStatusInAndFollowUpDateLessThanEqualOrderByFollowUpDateAscIdAsc(
            Long ownerId, Collection<ApplicationStatus> statuses, LocalDate date);

    @Query("""
            SELECT application
            FROM JobApplication application
            WHERE application.owner.id = :ownerId AND (
                :search IS NULL
                OR LOWER(application.company) LIKE LOWER(CONCAT('%', :search, '%')) ESCAPE '!'
                OR LOWER(application.title) LIKE LOWER(CONCAT('%', :search, '%')) ESCAPE '!'
                OR LOWER(application.location) LIKE LOWER(CONCAT('%', :search, '%')) ESCAPE '!'
            )
            AND (
                :status IS NULL
                OR application.status = :status
            )
            """)
    Page<JobApplication> search(
            @Param("ownerId") Long ownerId,
            @Param("search") String search,
            @Param("status") ApplicationStatus status,
            Pageable pageable
    );
}