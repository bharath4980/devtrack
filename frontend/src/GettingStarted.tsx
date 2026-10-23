type Props = {
  disabled: boolean;
  onAddApplication: () => void;
  onImportCsv: () => void;
};

/**
 * The guide is shown only when the authenticated account has no applications.
 * It is informational; it never creates fictitious jobs or modifies user data.
 */
export default function GettingStarted({ disabled, onAddApplication, onImportCsv }: Props) {
  return <section className="getting-started" id="overview" aria-labelledby="getting-started-heading">
    <div className="getting-started-intro">
      <p className="eyebrow">Getting started</p>
      <h2 id="getting-started-heading">Welcome to your job search workspace</h2>
      <p>Save your first opportunity or bring in applications you've already tracked.
        Your dashboard will fill in as you add real applications.</p>
      <div className="getting-started-actions">
        <button type="button" disabled={disabled} onClick={onAddApplication}>Add your first application</button>
        <button type="button" className="secondary-button" disabled={disabled}
          onClick={onImportCsv}>Import an existing CSV</button>
      </div>
    </div>
    <div className="getting-started-steps" aria-label="How DevTrack works">
      <div className="getting-started-step">
        <span aria-hidden="true" className="getting-started-number">1</span>
        <div><h3>Save an opportunity</h3>
          <p>Record the company, role, posting link, and application date.</p></div>
      </div>
      <div className="getting-started-step">
        <span aria-hidden="true" className="getting-started-number">2</span>
        <div><h3>Track your next steps</h3>
          <p>Move applications through the pipeline and set follow-up dates when needed.</p></div>
      </div>
      <div className="getting-started-step">
        <span aria-hidden="true" className="getting-started-number">3</span>
        <div><h3>Prepare for interviews</h3>
          <p>Add interview rounds and preparation notes when opportunities progress.</p></div>
      </div>
    </div>
    <p className="getting-started-footer">Nothing is added to your account until you save or import it.</p>
  </section>;
}
