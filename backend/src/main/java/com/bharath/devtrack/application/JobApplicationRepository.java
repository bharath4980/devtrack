package com.bharath.devtrack.application;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface JobApplicationRepository extends JpaRepository<JobApplication, Long> {

    @Query("""
            SELECT application
            FROM JobApplication application
            WHERE (
                :search IS NULL
                OR LOWER(application.company) LIKE LOWER(CONCAT('%', :search, '%'))
                OR LOWER(application.title) LIKE LOWER(CONCAT('%', :search, '%'))
                OR LOWER(application.location) LIKE LOWER(CONCAT('%', :search, '%'))
            )
            AND (
                :status IS NULL
                OR application.status = :status
            )
            ORDER BY application.id DESC
            """)
    List<JobApplication> search(
            @Param("search") String search,
            @Param("status") ApplicationStatus status
    );
}