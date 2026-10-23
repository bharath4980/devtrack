package com.bharath.devtrack.interview;

import com.bharath.devtrack.application.JobApplicationService;
import java.time.LocalDate;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional
public class InterviewRoundService {
    private static final int MAX_ROUNDS_PER_APPLICATION = 30;
    private final InterviewRoundRepository rounds;
    private final JobApplicationService applications;

    public InterviewRoundService(InterviewRoundRepository rounds, JobApplicationService applications) {
        this.rounds = rounds;
        this.applications = applications;
    }

    public record RoundDetails(Long id, String roundName, LocalDate scheduledDate,
                               InterviewRound.Format format, String contactName, String contactEmail,
                               String preparationNotes, String followUpNotes, InterviewRound.Outcome outcome) {
        static RoundDetails from(InterviewRound round) {
            return new RoundDetails(round.getId(), round.getRoundName(), round.getScheduledDate(),
                    round.getFormat(), round.getContactName(), round.getContactEmail(),
                    round.getPreparationNotes(), round.getFollowUpNotes(), round.getOutcome());
        }
    }

    @Transactional(readOnly = true)
    public List<RoundDetails> list(Long ownerId, Long applicationId) {
        applications.getForOwner(ownerId, applicationId);
        return rounds.findByApplicationIdAndOwnerIdOrderByIdAsc(applicationId, ownerId).stream()
                .map(RoundDetails::from).toList();
    }

    public RoundDetails create(Long ownerId, Long applicationId, InterviewRoundRequest request) {
        applications.getForOwner(ownerId, applicationId);
        if (rounds.countByApplicationIdAndOwnerId(applicationId, ownerId) >= MAX_ROUNDS_PER_APPLICATION) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Limit of 30 interview rounds per application");
        }
        InterviewRound round = new InterviewRound();
        round.setApplicationId(applicationId);
        round.setOwnerId(ownerId);
        copy(request, round);
        return RoundDetails.from(rounds.save(round));
    }

    public RoundDetails update(Long ownerId, Long applicationId, Long roundId, InterviewRoundRequest request) {
        applications.getForOwner(ownerId, applicationId);
        InterviewRound round = findOwned(ownerId, applicationId, roundId);
        copy(request, round);
        return RoundDetails.from(rounds.save(round));
    }

    public void delete(Long ownerId, Long applicationId, Long roundId) {
        applications.getForOwner(ownerId, applicationId);
        rounds.delete(findOwned(ownerId, applicationId, roundId));
    }

    private InterviewRound findOwned(Long ownerId, Long applicationId, Long id) {
        return rounds.findByIdAndApplicationIdAndOwnerId(id, applicationId, ownerId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Interview round not found"));
    }

    private static String optionalText(String text) {
        return text == null || text.isBlank() ? null : text.trim();
    }

    private static void copy(InterviewRoundRequest request, InterviewRound round) {
        round.setRoundName(request.roundName().trim());
        round.setScheduledDate(request.scheduledDate());
        round.setFormat(request.format());
        round.setContactName(optionalText(request.contactName()));
        round.setContactEmail(optionalText(request.contactEmail()));
        round.setPreparationNotes(optionalText(request.preparationNotes()));
        round.setFollowUpNotes(optionalText(request.followUpNotes()));
        round.setOutcome(request.outcome());
    }
}
