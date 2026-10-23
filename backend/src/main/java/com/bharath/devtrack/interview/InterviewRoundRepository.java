package com.bharath.devtrack.interview;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InterviewRoundRepository extends JpaRepository<InterviewRound, Long> {
    List<InterviewRound> findByApplicationIdAndOwnerIdOrderByIdAsc(Long applicationId, Long ownerId);
    Optional<InterviewRound> findByIdAndApplicationIdAndOwnerId(Long id, Long applicationId, Long ownerId);
    long countByApplicationIdAndOwnerId(Long applicationId, Long ownerId);
}
