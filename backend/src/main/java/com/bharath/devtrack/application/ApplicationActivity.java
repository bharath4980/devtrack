package com.bharath.devtrack.application;

import com.bharath.devtrack.auth.UserAccount;
import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "application_activity")
public class ApplicationActivity {
    public enum Type { CREATED, STATUS_CHANGED, FOLLOW_UP_COMPLETED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "application_id", nullable = false)
    private JobApplication application;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_id", nullable = false)
    private UserAccount owner;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private Type type;

    @Enumerated(EnumType.STRING)
    @Column(name = "from_status", length = 32)
    private ApplicationStatus fromStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "to_status", nullable = false, length = 32)
    private ApplicationStatus toStatus;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    protected ApplicationActivity() {}

    public ApplicationActivity(JobApplication application, UserAccount owner, Type type,
                               ApplicationStatus fromStatus, ApplicationStatus toStatus, Instant occurredAt) {
        this.application = application;
        this.owner = owner;
        this.type = type;
        this.fromStatus = fromStatus;
        this.toStatus = toStatus;
        this.occurredAt = occurredAt;
    }

    public Long getId() { return id; }
    public JobApplication getApplication() { return application; }
    public Type getType() { return type; }
    public ApplicationStatus getFromStatus() { return fromStatus; }
    public ApplicationStatus getToStatus() { return toStatus; }
    public Instant getOccurredAt() { return occurredAt; }
}
