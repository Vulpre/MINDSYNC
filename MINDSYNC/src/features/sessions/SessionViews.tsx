import { useEffect, useState } from 'react';
import {
  faArrowLeft,
  faArrowRight,
  faCircleCheck,
  faCircleInfo,
  faFlagCheckered,
  faPause,
  faPlay,
  faShieldHalved,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { AppIcon, Button, Modal, PageHeader, ReviewBadge, SessionBadge } from '../../components/ui';
import type { ChecklistSession } from '../../types';

export function SessionView({
  session,
  saving,
  onUpdate,
  onPause,
  onResume,
  onReview,
  onEnd,
}: {
  session: ChecklistSession;
  saving: boolean;
  onUpdate: (patch: Partial<ChecklistSession>) => Promise<boolean>;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  onReview: () => void;
  onEnd: () => void;
}) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const step = session.checklist.steps[session.currentStepIndex];
  const noteValue = step ? session.stepNotes[step.id] ?? '' : '';
  const [editedNote, setEditedNote] = useState(noteValue);
  useEffect(() => setEditedNote(noteValue), [session.id, step?.id, noteValue]);
  const isComplete = step ? session.completedStepIds.includes(step.id) : false;
  const canAdvance = !!step && (!step.required || isComplete);
  const requiredTotal = session.checklist.steps.filter((item) => item.required).length;
  const completedRequired = session.checklist.steps.filter((item) => item.required && session.completedStepIds.includes(item.id)).length;
  const progressPercent = requiredTotal === 0 ? 100 : Math.round((completedRequired / requiredTotal) * 100);

  if (!step) {
    return <div className="panel"><p>This session has no steps. Return to the checklist editor and add reviewed steps.</p></div>;
  }

  function toggleComplete() {
    const next = isComplete
      ? session.completedStepIds.filter((id) => id !== step.id)
      : [...session.completedStepIds, step.id];
    void updateWithNote({ completedStepIds: next });
  }

  function currentNotePatch(): Partial<ChecklistSession> {
    if (!step || editedNote === (session.stepNotes[step.id] ?? '')) return {};
    return { stepNotes: { ...session.stepNotes, [step.id]: editedNote } };
  }

  async function saveNote() {
    if (!step || editedNote === (session.stepNotes[step.id] ?? '')) return true;
    const saved = await onUpdate(currentNotePatch());
    if (!saved) setEditedNote(session.stepNotes[step.id] ?? '');
    return saved;
  }

  async function updateWithNote(patch: Partial<ChecklistSession>) {
    return onUpdate({ ...patch, ...currentNotePatch() });
  }

  async function goTo(index: number) {
    if (session.status === 'paused' || index > session.currentStepIndex) return;
    if (await saveNote()) void onUpdate({ currentStepIndex: index });
  }

  async function nextStep() {
    if (!canAdvance) return;
    if (session.currentStepIndex === session.checklist.steps.length - 1) {
      if (await saveNote()) onReview();
    } else {
      void updateWithNote({ currentStepIndex: session.currentStepIndex + 1 });
    }
  }

  async function pauseAndSave() {
    if (await saveNote()) await onPause();
  }

  async function endAndSave() {
    if (await saveNote()) onEnd();
  }

  return (
    <>
      <div className="session-topline">
        <span className="session-mode-label">Checklist session</span>
        <SessionBadge status={session.status} />
      </div>
      <PageHeader
        eyebrow="Supervised simulation"
        title={session.checklist.title}
        description={session.participantId ? `Participant ID: ${session.participantId}` : 'No participant ID entered'}
      />
      <div className="session-meta-strip">
        <ReviewBadge status={session.checklist.reviewStatus} />
        <span>{session.checklist.steps.length} ordered {session.checklist.steps.length === 1 ? 'step' : 'steps'}</span>
        <span>Started {formatDateTime(session.startedAt)}</span>
      </div>

      <section className="progress-panel" aria-label="Checklist progress">
        <div className="progress-header">
          <span>Required steps complete</span>
          <strong>{completedRequired} / {requiredTotal}</strong>
        </div>
        <div className="progress-track" role="progressbar" aria-label="Required steps completed" aria-valuemin={0} aria-valuemax={requiredTotal || 1} aria-valuenow={completedRequired}>
          <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
        <span className="muted small">{progressPercent}% of required steps verified by you</span>
      </section>

      {session.status === 'paused' && (
        <div className="paused-banner" role="status">
          <AppIcon icon={faCircleInfo} />
          <span>Session paused. Your progress is saved to your MINDSYNC account.</span>
          <Button variant="primary" icon={faPlay} onClick={() => { void onResume(); }} disabled={saving}>{saving ? 'Saving…' : 'Resume session'}</Button>
        </div>
      )}

      <div className="session-layout">
        <aside className="step-outline panel" aria-label="Procedure step list">
          <div className="panel-heading"><h2>Step outline</h2><span className="muted small">{session.checklist.steps.length}</span></div>
          <ol className="step-outline-list">
            {session.checklist.steps.map((item, index) => {
              const done = session.completedStepIds.includes(item.id);
              const current = index === session.currentStepIndex;
              const unavailable = session.status === 'paused' || index > session.currentStepIndex;
              return (
                <li key={item.id}>
                    <button type="button" className={`outline-step ${current ? 'is-current' : ''} ${done ? 'is-done' : ''}`} onClick={() => goTo(index)} disabled={saving || unavailable} aria-current={current ? 'step' : undefined}>
                    <span className="outline-step-marker">{done ? <AppIcon icon={faCircleCheck} /> : String(index + 1).padStart(2, '0')}</span>
                    <span className="outline-step-text"><span>{item.title}</span><small>{done ? 'Completed' : item.required ? 'Required' : 'Optional'}</small></span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        <section className="current-step-card" aria-labelledby="active-step-title">
          <div className="step-card-kicker">
            <span>STEP {String(session.currentStepIndex + 1).padStart(2, '0')}</span>
            <span className={step.required ? 'required-label' : 'optional-label'}>{step.required ? 'Required' : 'Optional'}</span>
          </div>
          {step.attention && <div className="attention-note"><AppIcon icon={faShieldHalved} /> Attention label added by the checklist author</div>}
          <h2 id="active-step-title">{step.title}</h2>
          {step.description && <p className="current-step-description">{step.description}</p>}
          {step.required && <p className="step-guidance"><AppIcon icon={faCircleInfo} /> Mark this step complete before moving forward.</p>}

          <button type="button" className={`completion-toggle ${isComplete ? 'checked' : ''}`} onClick={toggleComplete} disabled={saving || session.status === 'paused'} aria-pressed={isComplete}>
            <span className="completion-check">{isComplete && <AppIcon icon={faCircleCheck} />}</span>
            <span>{isComplete ? 'Marked complete — select to undo' : 'I have completed this step'}</span>
          </button>

          <label className="field-label" htmlFor={`note-${step.id}`}>Personal note <span className="muted">(optional; visible to researchers; do not enter patient-identifying or sensitive information)</span></label>
          <textarea id={`note-${step.id}`} className="text-input textarea session-note" rows={3} maxLength={1000} value={editedNote} onChange={(event) => setEditedNote(event.target.value)} disabled={saving || session.status === 'paused'} placeholder="Add a reminder for this simulation session" />
          <p className="field-help">This optional note is saved with your next step or session action and is visible to researchers.</p>

          <div className="session-controls">
            <Button variant="quiet" icon={faArrowLeft} onClick={() => { void goTo(session.currentStepIndex - 1); }} disabled={saving || session.currentStepIndex === 0 || session.status === 'paused'}>Previous</Button>
            <Button variant="primary" icon={faArrowRight} onClick={() => { void nextStep(); }} disabled={saving || !canAdvance || session.status === 'paused'}>
              {session.currentStepIndex === session.checklist.steps.length - 1 ? 'Review checklist' : 'Next step'}
            </Button>
          </div>
          {!canAdvance && session.status === 'active' && <p className="blocking-help">Complete this required step to continue.</p>}
        </section>
      </div>

      <div className="session-bottom-actions">
        {session.status === 'active' ? (
          <Button variant="secondary" icon={faPause} onClick={() => { void pauseAndSave(); }} disabled={saving}>{saving ? 'Saving…' : 'Pause and save progress'}</Button>
        ) : <Button variant="secondary" icon={faPlay} onClick={() => { void onResume(); }} disabled={saving}>{saving ? 'Saving…' : 'Resume session'}</Button>}
        <Button variant="quiet" icon={faXmark} onClick={() => setConfirmEnd(true)} disabled={saving}>End session</Button>
      </div>

      {confirmEnd && (
        <Modal title="End this session?" description="Your progress will be saved and this session will be recorded as ended incomplete, not completed." onClose={() => setConfirmEnd(false)}>
          <div className="modal-actions">
            <Button variant="quiet" onClick={() => setConfirmEnd(false)} disabled={saving}>Keep working</Button>
            <Button variant="danger" onClick={() => { void endAndSave(); }} disabled={saving}>End incomplete</Button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function SessionReview({
  session,
  saving,
  onReturnToStep,
  onComplete,
  onEnd,
}: {
  session: ChecklistSession;
  saving: boolean;
  onReturnToStep: (index: number) => Promise<void>;
  onComplete: () => void;
  onEnd: () => void;
}) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const requiredSteps = session.checklist.steps.filter((step) => step.required);
  const missing = requiredSteps.filter((step) => !session.completedStepIds.includes(step.id));
  const optionalIncomplete = session.checklist.steps.filter((step) => !step.required && !session.completedStepIds.includes(step.id));
  const completed = session.checklist.steps.filter((step) => session.completedStepIds.includes(step.id)).length;

  return (
    <>
      <PageHeader eyebrow="Final review" title="Review your checklist" description="Check the recorded steps before completing this simulation session." />
      <div className="review-summary-strip">
        <strong>{completed} of {session.checklist.steps.length}</strong><span>steps marked complete</span>
        {missing.length > 0 ? <span className="review-alert">{missing.length} required {missing.length === 1 ? 'step' : 'steps'} remaining</span> : <span className="review-ready">All required steps marked complete</span>}
      </div>
      <div className="review-step-list">
        {session.checklist.steps.map((step, index) => {
          const done = session.completedStepIds.includes(step.id);
          return (
            <button type="button" className={`review-step ${done ? 'review-step-done' : 'review-step-missing'}`} key={step.id} onClick={() => { void onReturnToStep(index); }} disabled={saving}>
              <span className="review-step-icon"><AppIcon icon={done ? faCircleCheck : faCircleInfo} /></span>
              <span className="review-step-content"><strong>{step.title}</strong><small>{done ? 'Marked complete' : step.required ? 'Required — not marked complete' : 'Optional — not marked complete'}</small></span>
              <span className="review-step-jump">{done ? 'Review' : 'Go to step'} <AppIcon icon={faArrowRight} /></span>
            </button>
          );
        })}
      </div>
      {missing.length > 0 && <p className="blocking-help">Return to each incomplete required step and verify it before completing this session.</p>}
      {optionalIncomplete.length > 0 && missing.length === 0 && <p className="muted small">Optional steps not marked complete do not prevent session completion.</p>}
      <div className="form-actions session-review-actions">
        <Button variant="quiet" icon={faArrowLeft} onClick={() => { void onReturnToStep(Math.max(0, session.currentStepIndex)); }} disabled={saving}>Back to current step</Button>
        <Button variant="secondary" onClick={() => setConfirmEnd(true)} disabled={saving}>End incomplete</Button>
        <Button variant="primary" icon={faFlagCheckered} onClick={onComplete} disabled={saving || missing.length > 0}>{saving ? 'Saving…' : 'Complete session'}</Button>
      </div>
      {confirmEnd && (
        <Modal title="End this session incomplete?" description="The session will be saved as ended incomplete, not completed." onClose={() => setConfirmEnd(false)}>
          <div className="modal-actions">
            <Button variant="quiet" onClick={() => setConfirmEnd(false)} disabled={saving}>Keep reviewing</Button>
            <Button variant="danger" onClick={onEnd} disabled={saving}>End incomplete</Button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function SessionSummary({
  session,
  hasEvaluation,
  canEvaluate,
  onEvaluate,
  onHome,
}: {
  session: ChecklistSession;
  hasEvaluation: boolean;
  canEvaluate: boolean;
  onEvaluate: () => void;
  onHome: () => void;
}) {
  const completeCount = session.completedStepIds.length;
  const remainingRequired = session.checklist.steps.filter((step) => step.required && !session.completedStepIds.includes(step.id)).length;
  const isCompleted = session.status === 'completed';
  const elapsedMinutes = session.endedAt ? Math.max(0, Math.round((new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 60000)) : null;

  return (
    <>
      <div className="summary-hero">
        <div className={`summary-mark ${isCompleted ? 'summary-mark-success' : 'summary-mark-muted'}`}><AppIcon icon={isCompleted ? faCircleCheck : faCircleInfo} /></div>
        <p className="eyebrow">Simulation session summary</p>
        <h1>{isCompleted ? 'Session completed' : session.status === 'paused' ? 'Session paused' : session.status === 'active' ? 'Session in progress' : 'Session ended incomplete'}</h1>
        <p className="summary-subtitle">{session.checklist.title}</p>
        <SessionBadge status={session.status} />
      </div>
      <div className="summary-stat-row">
        <div className="summary-stat"><strong>{completeCount}<span>/{session.checklist.steps.length}</span></strong><small>steps marked complete</small></div>
        <div className="summary-stat"><strong>{remainingRequired}</strong><small>required steps remaining</small></div>
        <div className="summary-stat"><strong>{elapsedMinutes === null ? '—' : `${elapsedMinutes}m`}</strong><small>elapsed time</small></div>
      </div>
      <div className="panel summary-details">
        <h2>Session details</h2>
        <dl className="details-grid">
          <div><dt>Started</dt><dd>{formatDateTime(session.startedAt)}</dd></div>
          <div><dt>Ended</dt><dd>{session.endedAt ? formatDateTime(session.endedAt) : 'Not ended'}</dd></div>
          <div><dt>Participant ID</dt><dd>{session.participantId || 'Not provided'}</dd></div>
          <div><dt>Checklist status</dt><dd><ReviewBadge status={session.checklist.reviewStatus} /></dd></div>
        </dl>
      </div>
      <p className="summary-disclaimer">This summary records checklist interaction only. It is not an assessment of clinical competence or evidence of patient-safety outcomes.</p>
      <div className="form-actions summary-actions">
        {canEvaluate && !hasEvaluation && <Button variant="primary" onClick={onEvaluate}>Share optional feedback</Button>}
        {canEvaluate && hasEvaluation && <span className="muted small">Feedback has been recorded for this session.</span>}
        <Button variant="secondary" onClick={onHome}>Return to home</Button>
      </div>
    </>
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
