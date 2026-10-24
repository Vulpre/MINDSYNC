import { faChartColumn, faDownload, faFileCsv, faFileCode } from '@fortawesome/free-solid-svg-icons';
import { AppIcon, Button, EmptyState, PageHeader } from '../../components/ui';
import { EVALUATION_QUESTIONS, type AppData, type EvaluationResponse } from '../../types';

const ratingLabels: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'Strongly disagree',
  2: 'Disagree',
  3: 'Neither',
  4: 'Agree',
  5: 'Strongly agree',
};

export function Reports({ data }: { data: AppData }) {
  const hasData = data.sessions.length > 0 || data.evaluations.length > 0;
  const completed = data.sessions.filter((item) => item.status === 'completed').length;
  const incomplete = data.sessions.filter((item) => item.status === 'ended_incomplete').length;
  const paused = data.sessions.filter((item) => item.status === 'paused' || item.status === 'active').length;

  function exportJson() {
    download('mindsync-records.json', JSON.stringify({ sessions: exportSessions(data), evaluations: data.evaluations }, null, 2), 'application/json');
  }

  function exportSessionsCsv() {
    const rows = data.sessions.map((session) => ({
      sessionId: session.id,
      checklistTitle: session.checklist.title,
      reviewStatus: session.checklist.reviewStatus,
      status: session.status,
      participantId: session.participantId,
      completedSteps: session.completedStepIds.length,
      requiredSteps: session.checklist.steps.filter((step) => step.required).length,
      startedAt: session.startedAt,
      endedAt: session.endedAt ?? '',
    }));
    download('mindsync-sessions.csv', toCsv(rows, ['sessionId', 'checklistTitle', 'reviewStatus', 'status', 'participantId', 'completedSteps', 'requiredSteps', 'startedAt', 'endedAt']), 'text/csv;charset=utf-8');
  }

  function exportEvaluationsCsv() {
    const rows = data.evaluations.map((response) => evaluationRow(response));
    const columns = ['id', 'sessionId', 'checklistTitle', 'participantId', 'createdAt', ...EVALUATION_QUESTIONS.map((question) => question.id), 'workedWell', 'confusing', 'improve'];
    download('mindsync-evaluations.csv', toCsv(rows, columns), 'text/csv;charset=utf-8');
  }

  return (
    <>
      <PageHeader
        eyebrow="Educator workspace"
        title="Reports"
        description="Operational prototype summaries from actual shared sessions and submitted feedback only. These are not measures of clinical effectiveness."
        actions={hasData ? (
          <div className="export-actions">
            <Button variant="secondary" icon={faFileCsv} onClick={exportSessionsCsv} disabled={data.sessions.length === 0}>Sessions CSV</Button>
            <Button variant="secondary" icon={faFileCsv} onClick={exportEvaluationsCsv} disabled={data.evaluations.length === 0}>Feedback CSV</Button>
            <Button variant="primary" icon={faFileCode} onClick={exportJson}>Export JSON</Button>
          </div>
        ) : undefined}
      />
      {!hasData ? (
        <EmptyState icon={faChartColumn} title="No report data yet" description="Once real sessions are completed and learners choose to submit feedback, operational summaries will appear here. No sample records are included." />
      ) : (
        <>
          <div className="report-stat-row">
            <ReportStat label="Sessions recorded" value={data.sessions.length} />
            <ReportStat label="Completed" value={completed} />
            <ReportStat label="Ended incomplete" value={incomplete} />
            <ReportStat label="Active or paused" value={paused} />
            <ReportStat label="Feedback responses" value={data.evaluations.length} />
          </div>
          <section className="panel report-panel">
            <div className="panel-heading"><div><p className="eyebrow">Checklist use</p><h2>Sessions by checklist</h2></div></div>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead><tr><th>Checklist</th><th>Sessions</th><th>Completed</th><th>Incomplete</th></tr></thead>
                <tbody>
                  {groupSessions(data.sessions).map((item) => <tr key={item.title}><td>{item.title}</td><td>{item.sessions}</td><td>{item.completed}</td><td>{item.incomplete}</td></tr>)}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel report-panel">
            <div className="panel-heading"><div><p className="eyebrow">Usability & acceptability</p><h2>Average response by statement</h2></div></div>
            {data.evaluations.length === 0 ? (
              <p className="muted">No feedback has been submitted yet.</p>
            ) : (
              <div className="rating-list">
                {EVALUATION_QUESTIONS.map((question) => {
                  const values = data.evaluations.map((response) => response.answers[question.id]).filter((value): value is 1 | 2 | 3 | 4 | 5 => typeof value === 'number');
                  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
                  return (
                    <div className="rating-row" key={question.id}>
                      <span>{question.text}</span>
                      <div className="rating-meter" aria-label={average === null ? 'No ratings' : `Average ${average.toFixed(1)} out of 5`}><div style={{ width: `${average === null ? 0 : average / 5 * 100}%` }} /></div>
                      <strong>{average === null ? '—' : average.toFixed(1)}</strong>
                      <small>{values.length} responses</small>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
          {data.evaluations.length > 0 && (
            <section className="panel report-panel feedback-responses-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Individual responses</p>
                  <h2>Submitted feedback</h2>
                  <p className="muted small">Open a response to view its ratings and optional comments.</p>
                </div>
                <span className="feedback-response-count">{data.evaluations.length} {data.evaluations.length === 1 ? 'response' : 'responses'}</span>
              </div>
              <div className="feedback-response-list">
                {[...data.evaluations].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((response, index) => (
                  <details className="feedback-response" key={response.id}>
                    <summary className="feedback-response-summary">
                      <span className="feedback-response-summary-main">
                        <strong>{response.checklistTitle || 'Checklist feedback'}</strong>
                        <span>Response {data.evaluations.length - index} · {formatSubmittedAt(response.createdAt)}{response.participantId ? ` · Anonymous ID: ${response.participantId}` : ''}</span>
                      </span>
                      <span className="feedback-response-open">View response</span>
                    </summary>
                    <div className="feedback-response-content">
                      <h3>Ratings</h3>
                      <dl className="feedback-response-ratings">
                        {EVALUATION_QUESTIONS.map((question) => {
                          const score = response.answers[question.id];
                          return (
                            <div className="feedback-rating-item" key={question.id}>
                              <dt>{question.text}</dt>
                              <dd>
                                <strong className="feedback-rating-score">{score ?? '—'}</strong>
                                <span>{score ? ratingLabels[score] : 'Not answered'}</span>
                              </dd>
                            </div>
                          );
                        })}
                      </dl>
                      <h3 className="feedback-comments-title">Optional comments</h3>
                      <div className="feedback-comments-grid">
                        <FeedbackComment title="What worked well?" value={response.workedWell} />
                        <FeedbackComment title="What was confusing or difficult?" value={response.confusing} />
                        <FeedbackComment title="What would you improve?" value={response.improve} />
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            </section>
          )}
          <p className="report-footnote"><AppIcon icon={faDownload} /> Summaries describe prototype interactions only. They do not demonstrate competence, error reduction, or patient-safety outcomes.</p>
        </>
      )}
    </>
  );
}

function FeedbackComment({ title, value }: { title: string; value: string }) {
  return (
    <article className="feedback-comment">
      <h4>{title}</h4>
      <p>{value.trim() || <span className="muted">No comment provided.</span>}</p>
    </article>
  );
}

function formatSubmittedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function ReportStat({ label, value }: { label: string; value: number }) {
  return <div className="report-stat"><span>{label}</span><strong>{value}</strong></div>;
}

function groupSessions(sessions: AppData['sessions']) {
  const groups = new Map<string, { title: string; sessions: number; completed: number; incomplete: number }>();
  sessions.forEach((session) => {
    const current = groups.get(session.checklist.title) ?? { title: session.checklist.title, sessions: 0, completed: 0, incomplete: 0 };
    current.sessions += 1;
    if (session.status === 'completed') current.completed += 1;
    if (session.status === 'ended_incomplete') current.incomplete += 1;
    groups.set(session.checklist.title, current);
  });
  return [...groups.values()].sort((a, b) => a.title.localeCompare(b.title));
}

function exportSessions(data: AppData) {
  return data.sessions.map((session) => ({
    id: session.id,
    checklistTitle: session.checklist.title,
    reviewStatus: session.checklist.reviewStatus,
    status: session.status,
    participantId: session.participantId,
    completedSteps: session.completedStepIds.length,
    requiredSteps: session.checklist.steps.filter((step) => step.required).length,
    startedAt: session.startedAt,
    endedAt: session.endedAt ?? null,
  }));
}

function evaluationRow(response: EvaluationResponse): Record<string, string | number> {
  return {
    id: response.id,
    sessionId: response.sessionId,
    checklistTitle: response.checklistTitle,
    participantId: response.participantId,
    createdAt: response.createdAt,
    ...response.answers,
    workedWell: response.workedWell,
    confusing: response.confusing,
    improve: response.improve,
  };
}

function toCsv(rows: Record<string, string | number>[], columns: string[]): string {
  const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [columns.map(quote).join(','), ...rows.map((row) => columns.map((column) => quote(row[column])).join(','))].join('\r\n');
}

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
