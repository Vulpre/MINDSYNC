import { faArrowRight, faRotateLeft, faClock, faListCheck } from '@fortawesome/free-solid-svg-icons';
import { AppIcon, Button, EmptyState, PageHeader, SessionBadge } from '../../components/ui';
import type { ChecklistSession } from '../../types';
import type { UserRole } from '../../auth/AuthProvider';

export function SessionHistory({ sessions, role, saving, onOpen }: { sessions: ChecklistSession[]; role: UserRole; saving: boolean; onOpen: (session: ChecklistSession) => void }) {
  const sorted = [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const isResearcher = role === 'researcher';
  return (
    <>
      <PageHeader
        eyebrow={isResearcher ? 'Researcher workspace' : 'Learner workspace'}
        title="Sessions"
        description={isResearcher
          ? 'Read-only session records from actual learner interactions. Auth user IDs and account emails are not shown.'
          : 'Your sessions are associated with this anonymous learner identity and can be resumed in this browser.'}
      />
      {sorted.length === 0 ? (
        <EmptyState icon={faClock} title="No sessions yet" description={isResearcher
          ? 'Session records will appear here after learners start simulations.'
          : 'A researcher must create and approve a checklist before you can start a supervised practice session.'} />
      ) : (
        <div className="session-history-list">
          {sorted.map((session) => {
            const completed = session.completedStepIds.length;
            const total = session.checklist.steps.length;
            const action = isResearcher
              ? 'View record'
              : session.status === 'paused' || session.status === 'active'
                ? session.status === 'paused' ? 'Resume session' : 'Continue session'
                : session.status === 'completed' ? 'View summary' : 'View session';
            return (
              <article className="history-card" key={session.id}>
                <div className="history-icon"><AppIcon icon={faListCheck} /></div>
                <div className="history-main">
                  <div className="history-title-row"><h2>{session.checklist.title}</h2><SessionBadge status={session.status} /></div>
                  <p className="muted">{formatDateTime(session.startedAt)} · {completed} of {total} steps marked complete</p>
                  {session.participantId && <p className="muted small">Anonymous participant ID: {session.participantId}</p>}
                </div>
                <Button variant="secondary" icon={session.status === 'paused' ? faRotateLeft : faArrowRight} onClick={() => onOpen(session)} disabled={saving}>{action}</Button>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
