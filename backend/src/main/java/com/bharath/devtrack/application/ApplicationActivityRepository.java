package com.bharath.devtrack.application;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Collection;
import java.util.List;

public interface ApplicationActivityRepository extends JpaRepository<ApplicationActivity, Long> {
    List<ApplicationActivity> findTop20ByApplication_IdAndOwner_IdOrderByOccurredAtDescIdDesc(
            Long applicationId, Long ownerId);

    List<ApplicationActivity> findTop12ByOwner_IdOrderByOccurredAtDescIdDesc(Long ownerId);

    @Query("""
            select count(a) from JobApplication a
            where a.owner.id = :ownerId
              and (a.status in :statuses or exists (
                select activity.id from ApplicationActivity activity
                where activity.application = a and activity.toStatus in :statuses
              ))
            """)
    long countReachedStatuses(@Param("ownerId") Long ownerId,
                              @Param("statuses") Collection<ApplicationStatus> statuses);
}
