import { useState, type FormEvent } from 'react';
import { errorMessage } from './apiError';
import DashboardQuickView from './DashboardQuickView';
import type { DashboardSummary, DueFollowUp, UpcomingInterview, UpcomingInterviewRound, ApplicationActivity, DashboardAnalytics } from './dashboardApi';
import { activityText, activityTime } from './ApplicationTimeline';
import { interviewTimeInBrowser } from './interviewLocalTime';
import { statuses, statusLabel, type UpdateJobApplicationRequest } from './types';

type Props = {
  summary: DashboardSummary | null;
  interviews: UpcomingInterview[];
  upcomingRounds: UpcomingInterviewRound[];
  followUps: DueFollowUp[];
  upcomingFollowUps: DueFollowUp[];
  onReschedule: (id: number, date: string) => Promise<void>;
  onCompleteFollowUp: (id: number) => Promise<void>;
  onEdit: (id: number, values: UpdateJobApplicationRequest) => Promise<void>;
  onInterviewChange: () => void;
  revision: number;
  busy: boolean;
  analytics: DashboardAnalytics | null;
  recentActivity: ApplicationActivity[];
  loading: boolean;
  error: string;
  onRetry: () => void;
};

function overdueLabel(date: string, todayUtc: string) {
  const days = Math.round((Date.parse(todayUtc + 'T00:00:00Z') -
    Date.parse(date + 'T00:00:00Z')) / (24 * 60 * 60 * 1000));
  return days + (days === 1 ? ' day overdue' : ' days overdue');
}

function daysUntil(date: string, todayUtc: string) {
  return Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(todayUtc + 'T00:00:00Z')) / 86400000);
}

function upcomingLabel(date: string, todayUtc: string) {
  const days = daysUntil(date, todayUtc);
  return days === 0 ? 'Today' : days === 1 ? 'Tomorrow' :
    days > 1 && days <= 7 ? 'In ' + days + ' days' : date;
}

type NextAction = {
  key: string;
  kind: 'follow-up' | 'interview';
  applicationId: number;
  company: string;
  title: string;
  description: string;
  date: string;
  timing: string;
  priority: number;
};

function nextActions(
  due: DueFollowUp[],
  upcoming: DueFollowUp[],
  rounds: UpcomingInterviewRound[],
  interviews: UpcomingInterview[],
  today: string,
): NextAction[] {
  const actions: NextAction[] = [];

  for (const item of due) {
    const overdue = item.followUpDate < today;
    actions.push({
      key: 'due-' + item.id, kind: 'follow-up', applicationId: item.id, company: item.company,
      title: item.title, description: 'Follow up', date: item.followUpDate,
      timing: overdue ? overdueLabel(item.followUpDate, today) : 'Due today',
      priority: overdue ? 0 : 1,
    });
  }
  for (const round of rounds) {
    const days = daysUntil(round.scheduledDate, today);
    if (days < 0 || days > 7) continue;
    actions.push({
      key: 'round-' + round.roundId, kind: 'interview', applicationId: round.applicationId,
      company: round.company, title: round.title,
      description: 'Interview round · ' + round.roundName, date: round.scheduledDate,
      timing: upcomingLabel(round.scheduledDate, today),
      priority: days === 0 ? 2 : days === 1 ? 3 : 5,
    });
  }
  for (const item of interviews) {
    const days = daysUntil(item.interviewDate, today);
    if (days < 0 || days > 7) continue;
    actions.push({
      key: 'interview-' + item.id, kind: 'interview', applicationId: item.id, company: item.company,
      title: item.title, description: 'Application interview',
      date: item.interviewDate, timing: upcomingLabel(item.interviewDate, today),
      priority: days === 0 ? 2 : days === 1 ? 3 : 5,
    });
  }
  for (const item of upcoming) {
    const days = daysUntil(item.followUpDate, today);
    if (days < 1 || days > 7) continue;
    actions.push({
      key: 'upcoming-' + item.id, kind: 'follow-up', applicationId: item.id, company: item.company,
      title: item.title, description: 'Follow up', date: item.followUpDate,
      timing: upcomingLabel(item.followUpDate, today),
      priority: days === 1 ? 4 : 6,
    });
  }

  return actions.sort((a, b) => a.priority - b.priority ||
    a.date.localeCompare(b.date) || a.company.localeCompare(b.company)).slice(0, 5);
}

type FollowUpRowProps = {
  item: DueFollowUp;
  todayUtc: string;
  upcoming: boolean;
  busy: boolean;
  onReschedule: (id: number, date: string) => Promise<void>;
  onComplete: (id: number) => Promise<void>;
  onOpen: (id: number) => void;
};

function FollowUpRow({ item, todayUtc, upcoming, busy, onReschedule, onComplete, onOpen }: FollowUpRowProps) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(item.followUpDate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fieldId = 'followup-' + (upcoming ? 'next-' : 'due-') + item.id;
  async function markComplete() {
    if (busy || saving || !window.confirm(
      'Complete the follow-up for ' + item.company + '? This clears its due date and records the completion in application history.'
    )) return;
    setSaving(true);
    setError('');
    try {
      await onComplete(item.id);
    } catch (failure) {
      setError(errorMessage(failure, 'Could not complete follow-up.'));
    } finally {
      setSaving(false);
    }
  }

  async function saveDate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || saving) return;
    setError('');
    setSaving(true);
    try {
      await onReschedule(item.id, date);
      setEditing(false);
    } catch (failure) {
      setError(errorMessage(failure, 'Could not reschedule follow-up.'));
    } finally {
      setSaving(false);
    }
  }

  return <div className={upcoming ? 'upcoming-interview follow-up-task upcoming-follow-up' :
      'upcoming-interview follow-up-task due-follow-up'}>
    <div className="follow-up-job"><h4>{item.title}</h4><p>{item.company}</p></div>
    <div className="follow-up-date">
      <span className={!upcoming && item.followUpDate < todayUtc ? 'due-label overdue' : 'due-label'}>
        {upcoming ? upcomingLabel(item.followUpDate, todayUtc) :
          item.followUpDate < todayUtc ? overdueLabel(item.followUpDate, todayUtc) : 'Due today'}
      </span>
      <time dateTime={item.followUpDate}>{item.followUpDate}</time>
      <button type="button" className="secondary-button quick-view-open"
        onClick={() => onOpen(item.id)}>Open application</button>
      <button type="button" className="secondary-button follow-up-complete"
        disabled={busy || saving} onClick={() => void markComplete()}>
        {saving ? 'Working…' : 'Complete follow-up'}
      </button>
      <button type="button" className="secondary-button reschedule-toggle"
        disabled={busy || saving} aria-expanded={editing}
        onClick={() => { setEditing(!editing); setDate(item.followUpDate); setError(''); }}>
        {editing ? 'Close' : 'Reschedule'}
      </button>
    </div>
    {editing && <form className="inline-reschedule" onSubmit={event => void saveDate(event)}>
      <label htmlFor={fieldId}>New follow-up date for {item.company}</label>
      <div className="inline-reschedule-controls">
        <input id={fieldId} type="date" value={date} required disabled={busy || saving}
          onChange={event => setDate(event.currentTarget.value)} />
        <button type="submit" disabled={busy || saving || !date || date === item.followUpDate}>
          {saving ? 'Saving…' : 'Save date'}
        </button>
      </div>
    </form>}
    {error && <p className="form-error inline-reschedule-error" role="alert">{error}</p>}
  </div>;
}

export default function Dashboard({ summary, interviews, upcomingRounds, followUps, upcomingFollowUps, onReschedule, onCompleteFollowUp, onEdit, onInterviewChange, revision, busy, analytics, recentActivity, loading, error, onRetry }: Props) {
  const [quickViewId, setQuickViewId] = useState<number | null>(null);
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [completionError, setCompletionError] = useState<{ id: number; message: string } | null>(null);
  const pipeline = statuses.map(status => ({
    status,
    count: summary?.[status.toLowerCase() as keyof DashboardSummary] ?? 0,
  }));
  const distributionLabel = 'Pipeline: ' + pipeline.map(item =>
    item.count + ' ' + statusLabel(item.status).toLowerCase()).join(', ');
  const now = new Date();
  const todayUtc = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')].join('-');
  const actions = nextActions(followUps, upcomingFollowUps, upcomingRounds, interviews, todayUtc);

  async function completeNextAction(id: number, company: string) {
    if (busy || completingId !== null || !window.confirm(
      'Complete the follow-up for ' + company +
      '? This clears its due date and records the completion in application history.'
    )) return;
    setCompletingId(id);
    setCompletionError(null);
    try {
      await onCompleteFollowUp(id);
    } catch (failure) {
      setCompletionError({ id, message: errorMessage(failure, 'Could not complete follow-up.') });
    } finally {
      setCompletingId(null);
    }
  }



  return <section className="overview" id="overview" aria-label="Dashboard">
    <div className="section-heading">
      <div>
        <p className="eyebrow">Pipeline overview</p>
        <h2>Your search, at a glance</h2>
        <p className="section-description">A clear view of your progress and what needs attention next.</p>
      </div>
      <span className="snapshot-label"><span className="snapshot-dot" aria-hidden="true" /> Current snapshot</span>
    </div>
    {quickViewId !== null && <DashboardQuickView key={quickViewId}
      applicationId={quickViewId} revision={revision} busy={busy}
      onClose={() => setQuickViewId(null)} onSave={onEdit} onInterviewChange={onInterviewChange} />}
    {loading && <div className="panel-state" role="status">Loading dashboard…</div>}
    {error && <div className="panel-state" role="alert"><p className="form-error">{error}</p><button className="secondary-button" onClick={onRetry}>Retry dashboard</button></div>}
    {!loading && !error && summary && <>
      <section className="next-actions-panel" aria-labelledby="next-actions-heading">
        <div className="next-actions-heading">
          <div>
            <p className="eyebrow">Your priorities</p>
            <h3 id="next-actions-heading">Next actions</h3>
            <p>Follow-ups and interviews that need attention in the next seven days.</p>
          </div>
          <a href="#follow-ups-heading">Full schedule ↓</a>
        </div>
        {actions.length === 0
          ? <p className="next-actions-empty">No follow-ups or interviews need attention this week.</p>
          : <ol className="next-actions-list">
              {actions.map(item => <li key={item.key}>
                <div className="next-action-copy">
                  <span className={item.priority === 0 ? 'next-action-timing next-action-overdue' :
                    'next-action-timing'}>{item.timing}</span>
                  <strong>{item.description}</strong>
                  <p>{item.company} · {item.title}</p>
                </div>
                <div className="next-action-controls">
                  <button type="button" className="secondary-button quick-view-open"
                    disabled={busy || completingId !== null}
                    onClick={() => setQuickViewId(item.applicationId)}>Open application</button>
                  {item.kind === 'follow-up' && <button type="button"
                    disabled={busy || completingId !== null}
                    onClick={() => void completeNextAction(item.applicationId, item.company)}>
                    {completingId === item.applicationId ? 'Completing…' : 'Complete follow-up'}
                  </button>}
                </div>
                {completionError?.id === item.applicationId && <p className="form-error" role="alert">
                  {completionError.message}
                </p>}
              </li>)}
            </ol>}
        <p className="form-help next-actions-note">
          Showing up to five priorities from the dashboard's scheduled items. More follow-ups and interviews appear below.
        </p>
      </section>
      <div className="kpi-grid">
        <div className="kpi-card kpi-primary"><span>Total applications</span><strong>{summary.total}</strong><small>Across your pipeline</small></div>
        <div className="kpi-card"><span>Applied</span><strong>{summary.applied}</strong><small>Applications submitted</small></div>
        <div className="kpi-card"><span>Interviews</span><strong>{summary.interview}</strong><small>In interview stage</small></div>
        <div className="kpi-card"><span>Offers</span><strong>{summary.offer}</strong><small>Opportunities received</small></div>
      </div>
      <div className="pipeline-panel">
        <div className="pipeline-heading">
          <div><h3>Pipeline distribution</h3><p>Every application, grouped by its current status.</p></div>
          <span>{summary.total} tracked</span>
        </div>
        <div className="pipeline-track" role="img" aria-label={distributionLabel}>
          {summary.total === 0
            ? <div className="pipeline-track-empty" />
            : pipeline.filter(item => item.count > 0).map(item =>
              <div key={item.status} className={'pipeline-segment segment-' + item.status.toLowerCase()}
                style={{ width: (item.count / summary.total * 100) + '%' }} />)}
        </div>
        <div className="pipeline-legend">
          {pipeline.map(item => <div className="legend-item" key={item.status}>
            <span className={'legend-dot segment-' + item.status.toLowerCase()} aria-hidden="true" />
            <span>{statusLabel(item.status)}</span>
            <strong>{item.count}</strong>
          </div>)}
        </div>
      </div>
      {analytics && <div className="insights-grid">
        <section className="insight-panel" aria-labelledby="trends-heading">
          <div className="pipeline-heading"><div><h3 id="trends-heading">Applications by month</h3>
            <p>Based on application dates entered for the last six months (UTC).</p></div></div>
          <div className="monthly-chart" role="img" aria-label={'Applications by month: ' +
            analytics.monthlyApplications.map(point => point.month + ' ' + point.applications).join(', ')}>
            {analytics.monthlyApplications.map(point => {
              const max = Math.max(1, ...analytics.monthlyApplications.map(item => item.applications));
              return <div key={point.month} className="monthly-column">
                <strong>{point.applications}</strong>
                <div className="monthly-bar-track"><div className="monthly-bar"
                  style={{ height: (point.applications / max * 100) + '%' }} /></div>
                <span>{point.month.slice(5)}</span>
              </div>;
            })}
          </div>
        </section>
        <section className="insight-panel" aria-labelledby="progress-heading">
          <div className="pipeline-heading"><div><h3 id="progress-heading">Application outcomes</h3>
            <p>Stages reached, using recorded history and current statuses.</p></div></div>
          <div className="outcome-row"><div><strong>{analytics.interviewOrOfferRate}%</strong>
            <span>Reached interview or offer</span></div><small>{analytics.interviewOrOfferReached} of {analytics.trackedApplications}</small></div>
          <div className="outcome-meter"><span style={{ width: analytics.interviewOrOfferRate + '%' }} /></div>
          <div className="outcome-row"><div><strong>{analytics.offerRate}%</strong><span>Reached offer</span></div>
            <small>{analytics.offersReached} of {analytics.trackedApplications}</small></div>
          <div className="outcome-meter outcome-offer"><span style={{ width: analytics.offerRate + '%' }} /></div>
          <p className="form-help outcome-note">Earlier stage changes cannot be reconstructed. Rates reflect available history and the latest recorded state.</p>
        </section>
      </div>}
      {analytics && <section className="insight-panel weekly-panel" aria-labelledby="weekly-heading">
        <div className="pipeline-heading">
          <div><h3 id="weekly-heading">Recorded activity by week</h3>
            <p>New applications and status changes captured during the last six UTC calendar weeks.</p></div>
        </div>
        <div className="weekly-legend" aria-hidden="true">
          <span><i className="weekly-key weekly-key-created" /> Applications created</span>
          <span><i className="weekly-key weekly-key-changed" /> Status changes</span>
        </div>
        <div className="weekly-chart" role="img" aria-label={'Recorded activity by week: ' +
          analytics.weeklyActivity.map(week => week.weekStart + ': ' + week.created +
            ' created, ' + week.statusChanges + ' status changes').join('; ')}>
          {analytics.weeklyActivity.map(week => {
            const max = Math.max(1, ...analytics.weeklyActivity.flatMap(item =>
              [item.created, item.statusChanges]));
            return <div className="weekly-column" key={week.weekStart}>
              <strong>{week.created + week.statusChanges}</strong>
              <div className="weekly-bars">
                <div className="weekly-bar weekly-bar-created"
                  style={{ height: (week.created / max * 100) + '%' }} />
                <div className="weekly-bar weekly-bar-changed"
                  style={{ height: (week.statusChanges / max * 100) + '%' }} />
              </div>
              <span>{new Date(week.weekStart + 'T00:00:00Z').toLocaleDateString(
                undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })}</span>
            </div>;
          })}
        </div>
        <p className="form-help weekly-note">Only recorded events are shown. Changes made before activity tracking began were not backfilled.</p>
      </section>}
      <section className="recent-panel" aria-labelledby="recent-heading">
        <div className="pipeline-heading"><div><h3 id="recent-heading">Recent activity</h3>
          <p>Latest saved applications and stage changes.</p></div><span>Latest 12</span></div>
        {recentActivity.length === 0
          ? <p className="form-help">No activity recorded yet. New applications and status changes will appear here.</p>
          : <ol className="recent-list">{recentActivity.map(item =>
              <li key={item.id}><span className="timeline-marker" aria-hidden="true" />
                <div><strong>{activityText(item)}</strong><p>{item.company} · {item.title}</p>
                  <button type="button" className="secondary-button quick-view-open"
                    onClick={() => setQuickViewId(item.applicationId)}>Open application</button>
                </div>
                <time dateTime={item.occurredAt}>{activityTime(item.occurredAt)}</time>
              </li>)}</ol>}
      </section>
      <div className="schedule-grid">
        <section className="schedule-panel" aria-labelledby="follow-ups-heading">
          <div className="schedule-heading">
            <div className="schedule-icon followup-icon" aria-hidden="true">↗</div>
            <div><h3 id="follow-ups-heading">Follow-ups due</h3><p>Earliest five · browser-local dates</p></div>
          </div>
          <div className="follow-up-priorities" role="group" aria-label="Follow-up priorities">
            <span className={summary.overdueFollowUps ? 'priority-count priority-overdue' : 'priority-count'}>
              <strong>{summary.overdueFollowUps}</strong> overdue
            </span>
            <span className="priority-count priority-today">
              <strong>{summary.dueTodayFollowUps}</strong> due today
            </span>
          </div>
          <div className="schedule-items">
            {followUps.length === 0
              ? <div className="schedule-empty"><span className="empty-symbol" aria-hidden="true">✓</span>
                  <p>You're all caught up.</p><small>Set a follow-up date on an application to keep it on your radar.</small>
                </div>
              : followUps.map(item => <FollowUpRow key={item.id} item={item} todayUtc={todayUtc}
                  onReschedule={onReschedule} onComplete={onCompleteFollowUp} onOpen={setQuickViewId} busy={busy} upcoming={false} />)}
          </div>
          <p className="form-help follow-up-count-note">Counts include all due applications, including those outside this five-item list.</p>
          <div className="upcoming-follow-ups-heading">
            <h4>Coming up · next 7 days</h4>
            <p>Next five upcoming follow-ups · UTC dates</p>
          </div>
          <div className="schedule-items">
            {upcomingFollowUps.length === 0
              ? <p className="form-help upcoming-empty">No upcoming follow-ups in the next seven days.</p>
              : upcomingFollowUps.map(item => <FollowUpRow key={item.id} item={item}
                  todayUtc={todayUtc} onReschedule={onReschedule} onComplete={onCompleteFollowUp}
                  onOpen={setQuickViewId} busy={busy} upcoming />)}
          </div>
        </section>
        <section className="schedule-panel" aria-labelledby="interviews-heading">
          <div className="schedule-heading">
            <div className="schedule-icon interview-icon" aria-hidden="true">◎</div>
            <div><h3 id="interviews-heading">Upcoming interviews</h3><p>Scheduled dates in UTC · open an application to prepare</p></div>
          </div>
          <div className="upcoming-follow-ups-heading">
            <h4>Scheduled interview rounds</h4>
            <p>Next five planned rounds · dates in UTC</p>
          </div>
          <div className="schedule-items" role="region" aria-label="Upcoming interview rounds">
            {upcomingRounds.length === 0
              ? <p className="form-help upcoming-empty">No planned interview rounds. Add one from an application's Interview prep section.</p>
              : upcomingRounds.map(round => <div className="upcoming-interview" key={round.roundId}>
                  <div><h4>{round.roundName}</h4>
                    <p>{round.company} · {round.title}</p>
                    <p className="form-help">{round.format.replaceAll('_', ' ').toLowerCase()}</p>
                    {round.scheduledTime && round.timeZone && <p className="form-help">
                      {round.scheduledTime} · {round.timeZone}
                    </p>}
                    {interviewTimeInBrowser(round.scheduledDate, round.scheduledTime, round.timeZone) &&
                      <p className="form-help">Your local time: {interviewTimeInBrowser(round.scheduledDate, round.scheduledTime, round.timeZone)}</p>}
                    <button type="button" className="secondary-button quick-view-open"
                      onClick={() => setQuickViewId(round.applicationId)}>Open application</button>
                  </div>
                  <div className="interview-date">
                    <span>{daysUntil(round.scheduledDate, todayUtc) <= 7
                      ? upcomingLabel(round.scheduledDate, todayUtc) : 'Scheduled'}</span>
                    <time dateTime={round.scheduledDate}>{round.scheduledDate}</time>
                  </div>
                </div>)}
          </div>
          <div className="upcoming-follow-ups-heading">
            <h4>Application interview dates</h4>
            <p>Next five dates on applications marked Interview</p>
          </div>
          <div className="schedule-items">
            {interviews.length === 0
              ? <div className="schedule-empty"><span className="empty-symbol" aria-hidden="true">◇</span>
                  <p>No application-level interview dates.</p><small>Add an interview date and set an application's status to Interview.</small>
                </div>
              : interviews.map(item => <div className="upcoming-interview" key={item.id}>
                  <div><h4>{item.title}</h4><p>{item.company}</p>
                    <button type="button" className="secondary-button quick-view-open"
                      onClick={() => setQuickViewId(item.id)}>Open application</button>
                  </div>
                  <div className="interview-date">
                    <span>{daysUntil(item.interviewDate, todayUtc) <= 7
                      ? upcomingLabel(item.interviewDate, todayUtc) : 'Scheduled'}</span>
                    <time dateTime={item.interviewDate}>{item.interviewDate}</time>
                  </div>
                </div>)}
          </div>
        </section>
      </div>
    </>}
  </section>;
}
