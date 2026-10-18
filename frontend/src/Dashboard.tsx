import type { DashboardSummary, DueFollowUp, UpcomingInterview } from './dashboardApi';
import { statuses, statusLabel } from './types';

type Props = {
  summary: DashboardSummary | null;
  interviews: UpcomingInterview[];
  followUps: DueFollowUp[];
  loading: boolean;
  error: string;
  onRetry: () => void;
};

export default function Dashboard({ summary, interviews, followUps, loading, error, onRetry }: Props) {
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
      <div className="schedule-grid">
        <section className="schedule-panel" aria-labelledby="follow-ups-heading">
          <div className="schedule-heading">
            <div className="schedule-icon followup-icon" aria-hidden="true">↗</div>
            <div><h3 id="follow-ups-heading">Follow-ups due</h3><p>Next five · dates in UTC</p></div>
          </div>
          <div className="schedule-items">
            {followUps.length === 0
              ? <div className="schedule-empty"><span className="empty-symbol" aria-hidden="true">✓</span>
                  <p>You're all caught up.</p><small>Set a follow-up date on an application to keep it on your radar.</small>
                </div>
              : followUps.map(item => <div className="upcoming-interview due-follow-up" key={item.id}>
                  <div><h4>{item.title}</h4><p>{item.company}</p></div>
                  <div className="follow-up-date">
                    <span className={item.followUpDate < todayUtc ? 'due-label overdue' : 'due-label'}>{item.followUpDate < todayUtc ? 'Overdue' : 'Due today'}</span>
                    <time dateTime={item.followUpDate}>{item.followUpDate}</time>
                  </div>
                </div>)}
          </div>
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
