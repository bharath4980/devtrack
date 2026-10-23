package com.bharath.devtrack.interview;

import com.bharath.devtrack.application.JobApplicationService;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.Instant;
import java.time.DateTimeException;
import java.time.format.DateTimeFormatter;
import java.nio.charset.StandardCharsets;
import java.net.URLEncoder;
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
                               String scheduledTime, String timeZone, InterviewRound.Format format,
                               String contactName, String contactEmail, String preparationNotes,
                               String followUpNotes, InterviewRound.Outcome outcome,
                               String googleCalendarUrl, String outlookCalendarUrl) {
        static RoundDetails from(InterviewRound round, String company, String roleTitle) {
            CalendarLinks links = calendarLinks(round, company, roleTitle);
            return new RoundDetails(round.getId(), round.getRoundName(), round.getScheduledDate(),
                    round.getScheduledTime() == null ? null : round.getScheduledTime().toString(),
                    round.getTimeZone(), round.getFormat(), round.getContactName(), round.getContactEmail(),
                    round.getPreparationNotes(), round.getFollowUpNotes(), round.getOutcome(),
                    links.google(), links.outlook());
        }
    }

    private record CalendarLinks(String google, String outlook) {}

    // Links only pre-fill calendar editors. Users must review and save each external event.
    // Do not send recruiter contacts, preparation notes, or follow-up notes in URLs.
    private static CalendarLinks calendarLinks(InterviewRound round, String company, String roleTitle) {
        if (round.getScheduledDate() == null || round.getScheduledTime() == null || round.getTimeZone() == null) {
            return new CalendarLinks(null, null);
        }
        ZoneId zone = validateZone(round.getTimeZone(), round.getScheduledDate(), round.getScheduledTime());
        Instant start = LocalDateTime.of(round.getScheduledDate(), round.getScheduledTime())
                .atZone(zone).toInstant();
        Instant end = start.plusSeconds(3600);
        DateTimeFormatter googleUtc = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'")
                .withZone(ZoneOffset.UTC);
        String title = round.getRoundName() + " - " + company;
        String details = "Role: " + roleTitle
                + "\nOne-hour placeholder; confirm the actual duration with your interviewer.";
        String google = "https://calendar.google.com/calendar/render?action=TEMPLATE"
                + "&text=" + urlEncode(title)
                + "&dates=" + urlEncode(googleUtc.format(start) + "/" + googleUtc.format(end))
                + "&stz=" + urlEncode(zone.getId()) + "&etz=" + urlEncode(zone.getId())
                + "&details=" + urlEncode(details);
        String outlook = "https://outlook.office.com/calendar/deeplink/compose"
                + "?path=" + urlEncode("/calendar/action/compose") + "&rru=addevent"
                + "&subject=" + urlEncode(title)
                + "&startdt=" + urlEncode(DateTimeFormatter.ISO_INSTANT.format(start))
                + "&enddt=" + urlEncode(DateTimeFormatter.ISO_INSTANT.format(end))
                + "&body=" + urlEncode(details);
        return new CalendarLinks(google, outlook);
    }

    private static String urlEncode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    @Transactional(readOnly = true)
    public List<RoundDetails> list(Long ownerId, Long applicationId) {
        var application = applications.getForOwner(ownerId, applicationId);
        return rounds.findByApplicationIdAndOwnerIdOrderByIdAsc(applicationId, ownerId).stream()
                .map(round -> RoundDetails.from(round, application.getCompany(), application.getTitle()))
                .toList();
    }

    public RoundDetails create(Long ownerId, Long applicationId, InterviewRoundRequest request) {
        var application = applications.getForOwner(ownerId, applicationId);
        if (rounds.countByApplicationIdAndOwnerId(applicationId, ownerId) >= MAX_ROUNDS_PER_APPLICATION) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Limit of 30 interview rounds per application");
        }
        InterviewRound round = new InterviewRound();
        round.setApplicationId(applicationId);
        round.setOwnerId(ownerId);
        copy(request, round);
        return RoundDetails.from(rounds.save(round), application.getCompany(), application.getTitle());
    }

    public RoundDetails update(Long ownerId, Long applicationId, Long roundId, InterviewRoundRequest request) {
        var application = applications.getForOwner(ownerId, applicationId);
        InterviewRound round = findOwned(ownerId, applicationId, roundId);
        copy(request, round);
        return RoundDetails.from(rounds.save(round), application.getCompany(), application.getTitle());
    }

    public void delete(Long ownerId, Long applicationId, Long roundId) {
        applications.getForOwner(ownerId, applicationId);
        rounds.delete(findOwned(ownerId, applicationId, roundId));
    }

    private InterviewRound findOwned(Long ownerId, Long applicationId, Long id) {
        return rounds.findByIdAndApplicationIdAndOwnerId(id, applicationId, ownerId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Interview round not found"));
    }

    @Transactional(readOnly = true)
    public byte[] calendar(Long ownerId, Long applicationId, Long roundId) {
        var application = applications.getForOwner(ownerId, applicationId);
        InterviewRound round = findOwned(ownerId, applicationId, roundId);
        if (round.getScheduledDate() == null || round.getScheduledTime() == null
                || round.getTimeZone() == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Set an interview date, time and time zone before exporting a calendar event");
        }
        ZoneId zone = validateZone(round.getTimeZone(), round.getScheduledDate(), round.getScheduledTime());
        Instant startsAt = LocalDateTime.of(round.getScheduledDate(), round.getScheduledTime())
                .atZone(zone).toInstant();
        // A one-hour placeholder is deliberate; the user can edit duration in their calendar.
        DateTimeFormatter utc = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC);
        String[] lines = {
                "BEGIN:VCALENDAR", "VERSION:2.0",
                "PRODID:-//DevTrack//Interview Calendar//EN", "CALSCALE:GREGORIAN",
                "BEGIN:VEVENT",
                "UID:interview-" + round.getId() + "-application-" + applicationId + "@devtrack.invalid",
                "DTSTAMP:" + utc.format(Instant.now()),
                "DTSTART:" + utc.format(startsAt),
                "DTEND:" + utc.format(startsAt.plusSeconds(3600)),
                "SUMMARY:" + escapeCalendarText(round.getRoundName() + " - " + application.getCompany()),
                "DESCRIPTION:" + escapeCalendarText("Role: " + application.getTitle()
                        + "\nOne-hour placeholder. Confirm the actual duration with your interviewer."),
                "END:VEVENT", "END:VCALENDAR"
        };
        StringBuilder calendar = new StringBuilder();
        for (String line : lines) calendar.append(foldCalendarLine(line));
        return calendar.toString().getBytes(StandardCharsets.UTF_8);
    }

    private static String escapeCalendarText(String raw) {
        return raw.replace("\\", "\\\\")
                .replace("\r\n", "\n").replace("\r", "\n")
                .replace("\n", "\\n")
                .replace(",", "\\,").replace(";", "\\;");
    }

    private static String foldCalendarLine(String line) {
        StringBuilder result = new StringBuilder();
        int column = 0;
        for (int offset = 0; offset < line.length();) {
            int cp = line.codePointAt(offset);
            String part = new String(Character.toChars(cp));
            int bytes = part.getBytes(StandardCharsets.UTF_8).length;
            if (column + bytes > 75) {
                result.append("\r\n ");
                column = 1;
            }
            result.append(part);
            column += bytes;
            offset += Character.charCount(cp);
        }
        return result.append("\r\n").toString();
    }

    private static ZoneId validateZone(String raw, LocalDate day, LocalTime time) {
        try {
            ZoneId zone = ZoneId.of(raw.trim());
            if (zone.getRules().getValidOffsets(LocalDateTime.of(day, time)).size() != 1) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "This local time is ambiguous or skipped due to daylight saving time. Choose another time.");
            }
            return zone;
        } catch (DateTimeException | NullPointerException failure) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Enter a valid IANA time zone, for example America/Chicago");
        }
    }

    private static String optionalText(String text) {
        return text == null || text.isBlank() ? null : text.trim();
    }

    private static void copy(InterviewRoundRequest request, InterviewRound round) {
        round.setRoundName(request.roundName().trim());
        LocalTime time = request.scheduledTime();
        String zoneText = optionalText(request.timeZone());
        if (time == null && zoneText != null || time != null && (request.scheduledDate() == null || zoneText == null)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Set a date, time and time zone together, or leave both time and time zone blank");
        }
        if (time != null) validateZone(zoneText, request.scheduledDate(), time);
        round.setScheduledDate(request.scheduledDate());
        round.setScheduledTime(time);
        round.setTimeZone(zoneText);
        round.setFormat(request.format());
        round.setContactName(optionalText(request.contactName()));
        round.setContactEmail(optionalText(request.contactEmail()));
        round.setPreparationNotes(optionalText(request.preparationNotes()));
        round.setFollowUpNotes(optionalText(request.followUpNotes()));
        round.setOutcome(request.outcome());
    }
}
