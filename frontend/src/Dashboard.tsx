import type { DashboardSummary, DueFollowUp, UpcomingInterview, ApplicationActivity, DashboardAnalytics } from './dashboardApi';
import { activityText, activityTime } from './ApplicationTimeline';
import { statuses, statusLabel } from './types';

type Props = {
  summary: DashboardSummary | null;
  interviews: UpcomingInterview[];
  followUps: DueFollowUp[];
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

export default function Dashboard({ summary, interviews, followUps, analytics, recentActivity, loading, error, onRetry }: Props) {
  const pipeline = statuses.map(status => ({
    status,
    count: summary?.[status.toLowerCase() as keyof DashboardSummary] ?? 0,
  }));
  const distributionLabel = 'Pipeline: ' + pipeline.map(item =>
    item.count + ' ' + statusLabel(item.status).toLowerCase()).join(', ');
  const todayUtc = new Date().toISOString().slice(0, 10);

  return <section className="overview" id="overview" aria-label="Dashboard">
    <div className="section-heading">
      <div>
        <p className="eyebrow">Pipeline overview</p>
        <h2>Your search, at a glance</h2>
        <p className="section-description">A clear view of your progress and what needs attention next.</p>
      </div>
      <span className="snapshot-label"><span className="snapshot-dot" aria-hidden="true" /> Current snapshot</span>
    </div>
    {loading && <div className="panel-state" role="status">Loading dashboard…</div>}
    {error && <div className="panel-state" role="alert"><p className="form-error">{error}</p><button className="secondary-button" onClick={onRetry}>Retry dashboard</button></div>}
    {!loading && !error && summary && <>
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
                <div><strong>{activityText(item)}</strong><p>{item.company} · {item.title}</p></div>
                <time dateTime={item.occurredAt}>{activityTime(item.occurredAt)}</time>
              </li>)}</ol>}
      </section>
      <div className="schedule-grid">
        <section className="schedule-panel" aria-labelledby="follow-ups-heading">
          <div className="schedule-heading">
            <div className="schedule-icon followup-icon" aria-hidden="true">↗</div>
            <div><h3 id="follow-ups-heading">Follow-ups due</h3><p>Earliest five · dates in UTC</p></div>
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
              : followUps.map(item => <div className="upcoming-interview due-follow-up" key={item.id}>
                  <div><h4>{item.title}</h4><p>{item.company}</p></div>
                  <div className="follow-up-date">
                    <span className={item.followUpDate < todayUtc ? 'due-label overdue' : 'due-label'}>{item.followUpDate < todayUtc ? overdueLabel(item.followUpDate, todayUtc) : 'Due today'}</span>
                    <time dateTime={item.followUpDate}>{item.followUpDate}</time>
                  </div>
                </div>)}
          </div>
          <p className="form-help follow-up-count-note">Counts include all due applications, including those outside this five-item list.</p>
        </section>
        <section className="schedule-panel" aria-labelledby="interviews-heading">
          <div className="schedule-heading">
            <div className="schedule-icon interview-icon" aria-hidden="true">◎</div>
            <div><h3 id="interviews-heading">Upcoming interviews</h3><p>Next five · dates in UTC</p></div>
          </div>
          <div className="schedule-items">
            {interviews.length === 0
              ? <div className="schedule-empty"><span className="empty-symbol" aria-hidden="true">◇</span>
                  <p>No interviews scheduled.</p><small>Add an interview date and set an application's status to Interview.</small>
                </div>
              : interviews.map(item => <div className="upcoming-interview" key={item.id}>
                  <div><h4>{item.title}</h4><p>{item.company}</p></div>
                  <time dateTime={item.interviewDate}>{item.interviewDate}</time>
                </div>)}
          </div>
        </section>
      </div>
    </>}
  </section>;
}
