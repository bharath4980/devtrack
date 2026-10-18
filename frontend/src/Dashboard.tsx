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
  return <section className="overview" aria-label="Dashboard">
    <h2>Application summary</h2>
    {loading && <p role="status">Loading dashboard…</p>}
    {error && <div role="alert"><p className="form-error">{error}</p><button className="secondary-button" onClick={onRetry}>Retry dashboard</button></div>}
    {!loading && !error && summary && <>
      <div className="dashboard-grid">
        <div className="dashboard-card"><span>Total</span><strong>{summary.total}</strong></div>
        {statuses.map(status => <div className="dashboard-card" key={status}>
          <span>{statusLabel(status)}</span><strong>{summary[status.toLowerCase() as keyof DashboardSummary]}</strong>
        </div>)}
      </div>
      <div className="interviews-heading"><h2>Follow-ups due</h2><span className="form-help">Next five · dates in UTC</span></div>
      {followUps.length === 0 ? <p className="form-help">Nothing to follow up on right now. Set a follow-up date on an application to keep it on your radar.</p> :
        followUps.map(item => <div className="upcoming-interview due-follow-up" key={item.id}>
          <div><h3>{item.title}</h3><p>{item.company}</p></div>
          <div className="follow-up-date"><span>{item.followUpDate < new Date().toISOString().slice(0, 10) ? 'Overdue' : 'Due today'}</span><time dateTime={item.followUpDate}>{item.followUpDate}</time></div>
        </div>)}
      <div className="interviews-heading"><h2>Upcoming interviews</h2><span className="form-help">Next five · dates in UTC</span></div>
      {interviews.length === 0 ? <p className="form-help">No upcoming interviews. Add an interview date when editing an application and set its status to Interview.</p> :
        interviews.map(interview => <div className="upcoming-interview" key={interview.id}>
          <div><h3>{interview.title}</h3><p>{interview.company}</p></div><time dateTime={interview.interviewDate}>{interview.interviewDate}</time>
        </div>)}
    </>}
  </section>;
}
