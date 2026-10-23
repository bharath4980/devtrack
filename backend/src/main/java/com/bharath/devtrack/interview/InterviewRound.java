package com.bharath.devtrack.interview;

import jakarta.persistence.*;
import java.time.LocalDate;

@Entity
@Table(name = "interview_rounds")
public class InterviewRound {
    public enum Format { PHONE, VIDEO, ONSITE, TAKE_HOME, OTHER }
    public enum Outcome { PLANNED, COMPLETED, CANCELLED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "application_id", nullable = false)
    private Long applicationId;

    @Column(name = "owner_id", nullable = false)
    private Long ownerId;

    @Column(name = "round_name", nullable = false, length = 120)
    private String roundName;

    @Column(name = "scheduled_date")
    private LocalDate scheduledDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private Format format;

    @Column(name = "contact_name", length = 255)
    private String contactName;

    @Column(name = "contact_email", length = 254)
    private String contactEmail;

    @Column(name = "preparation_notes", length = 2000)
    private String preparationNotes;

    @Column(name = "follow_up_notes", length = 2000)
    private String followUpNotes;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private Outcome outcome;

    public Long getId() { return id; }
    public Long getApplicationId() { return applicationId; }
    public void setApplicationId(Long applicationId) { this.applicationId = applicationId; }
    public Long getOwnerId() { return ownerId; }
    public void setOwnerId(Long ownerId) { this.ownerId = ownerId; }
    public String getRoundName() { return roundName; }
    public void setRoundName(String roundName) { this.roundName = roundName; }
    public LocalDate getScheduledDate() { return scheduledDate; }
    public void setScheduledDate(LocalDate scheduledDate) { this.scheduledDate = scheduledDate; }
    public Format getFormat() { return format; }
    public void setFormat(Format format) { this.format = format; }
    public String getContactName() { return contactName; }
    public void setContactName(String contactName) { this.contactName = contactName; }
    public String getContactEmail() { return contactEmail; }
    public void setContactEmail(String contactEmail) { this.contactEmail = contactEmail; }
    public String getPreparationNotes() { return preparationNotes; }
    public void setPreparationNotes(String preparationNotes) { this.preparationNotes = preparationNotes; }
    public String getFollowUpNotes() { return followUpNotes; }
    public void setFollowUpNotes(String followUpNotes) { this.followUpNotes = followUpNotes; }
    public Outcome getOutcome() { return outcome; }
    public void setOutcome(Outcome outcome) { this.outcome = outcome; }
}
