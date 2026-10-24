import { useState, type FormEvent } from 'react';
import {
  faArrowDown,
  faArrowRight,
  faArrowUp,
  faBoxArchive,
  faCopy,
  faListCheck,
  faPen,
  faPlus,
  faRotateLeft,
} from '@fortawesome/free-solid-svg-icons';
import { AppIcon, Button, EmptyState, IconButton, PageHeader, ReviewBadge } from '../../components/ui';
import type { Checklist, ChecklistStep, ReviewStatus } from '../../types';
import type { UserRole } from '../../auth/AuthProvider';
import { createId } from '../../lib/storage';

const statusOptions: { value: ReviewStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'awaiting_review', label: 'Awaiting Expert Review' },
  { value: 'approved_for_simulation', label: 'Approved for Simulation' },
];

function newStep(): ChecklistStep {
  return { id: createId(), title: '', description: '', required: true, attention: false };
}

export function ChecklistLibrary({
  role,
  checklists,
  saving,
  onCreate,
  onEdit,
  onDuplicate,
  onMove,
  onArchive,
  onRestore,
  onStart,
}: {
  role: UserRole;
  checklists: Checklist[];
  saving: boolean;
  onCreate: () => void;
  onEdit: (checklist: Checklist) => void;
  onDuplicate: (checklist: Checklist) => void;
  onMove: (checklist: Checklist, direction: -1 | 1) => void;
  onArchive: (checklist: Checklist) => void;
  onRestore: (checklist: Checklist) => void;
  onStart: (checklist: Checklist) => void;
}) {
  const isResearcher = role === 'researcher';
  const [showArchived, setShowArchived] = useState(false);
  const active = checklists.filter((item) => !item.archivedAt);
  const archived = checklists.filter((item) => item.archivedAt);
  const visible = isResearcher && showArchived ? archived : active;

  return (
    <>
      <PageHeader
        eyebrow={isResearcher ? 'Researcher workspace' : 'Learner workspace'}
        title="Checklists"
        description={isResearcher
          ? 'Create and manage instructor-reviewed simulation checklists. No procedure content is preloaded.'
          : 'Only active checklists marked Approved for Simulation are available here. Follow your instructor and current protocols.'}
        actions={isResearcher ? <Button variant="primary" icon={faPlus} onClick={onCreate} disabled={saving}>Create checklist</Button> : undefined}
      />
      {isResearcher ? (
        <div className="toolbar-row">
          <p className="muted small">{showArchived ? `${archived.length} archived` : `${active.length} active`}</p>
          <Button variant="quiet" onClick={() => setShowArchived((current) => !current)} disabled={saving}>
            <AppIcon icon={showArchived ? faRotateLeft : faBoxArchive} />
            {showArchived ? 'Show active checklists' : `Archived${archived.length ? ` (${archived.length})` : ''}`}
          </Button>
        </div>
      ) : <p className="muted small learner-checklist-count">{active.length} approved {active.length === 1 ? 'checklist' : 'checklists'} available</p>}

      {visible.length === 0 ? (
        <EmptyState
          icon={faListCheck}
          title={isResearcher ? (showArchived ? 'No archived checklists' : 'No checklists created yet') : 'No simulation checklists available'}
          description={isResearcher
            ? showArchived ? 'Archived checklists will appear here.' : 'Create a checklist and add the steps your nursing faculty has reviewed for supervised simulation.'
            : 'A researcher must create and approve a checklist for supervised simulation before it appears here.'}
          action={isResearcher && !showArchived ? <Button variant="primary" icon={faPlus} onClick={onCreate} disabled={saving}>Create your first checklist</Button> : undefined}
        />
      ) : (
        <div className="checklist-list">
          {visible.map((checklist, visibleIndex) => {
            const canStart = !checklist.archivedAt && checklist.reviewStatus === 'approved_for_simulation' && checklist.steps.length > 0;
            return (
              <article className="checklist-card" key={checklist.id}>
                <div className="checklist-card-main">
                  <div className="checklist-card-heading">
                    <h2>{checklist.title}</h2>
                    <ReviewBadge status={checklist.reviewStatus} />
                  </div>
                  {checklist.description && <p className="checklist-card-description">{checklist.description}</p>}
                  <div className="checklist-meta">
                    <span>{checklist.steps.length} {checklist.steps.length === 1 ? 'step' : 'steps'}</span>
                    <span aria-hidden="true">·</span>
                    <span>Updated {formatDate(checklist.updatedAt)}</span>
                  </div>
                  {isResearcher && checklist.reviewStatus !== 'approved_for_simulation' && !checklist.archivedAt && (
                    <p className="inline-guidance">Set “Approved for Simulation” only after qualified faculty review.</p>
                  )}
                </div>
                <div className="checklist-card-actions">
                  {isResearcher ? (
                    <>
                      {!showArchived && <IconButton icon={faArrowUp} label={`Move ${checklist.title} up`} onClick={() => onMove(checklist, -1)} disabled={saving || visibleIndex === 0} />}
                      {!showArchived && <IconButton icon={faArrowDown} label={`Move ${checklist.title} down`} onClick={() => onMove(checklist, 1)} disabled={saving || visibleIndex === visible.length - 1} />}
                      <Button variant="secondary" icon={faPen} onClick={() => onEdit(checklist)} disabled={saving}>Edit</Button>
                      <IconButton icon={faCopy} label={`Duplicate ${checklist.title}`} onClick={() => onDuplicate(checklist)} disabled={saving} />
                      {checklist.archivedAt ? (
                        <IconButton icon={faRotateLeft} label={`Restore ${checklist.title}`} onClick={() => onRestore(checklist)} disabled={saving} />
                      ) : (
                        <IconButton icon={faBoxArchive} label={`Archive ${checklist.title}`} onClick={() => onArchive(checklist)} disabled={saving} />
                      )}
                    </>
                  ) : (
                    canStart && <Button variant="primary" icon={faArrowRight} onClick={() => onStart(checklist)} disabled={saving}>Start simulation</Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

export function ChecklistEditor({
  checklist,
  onSave,
  onCancel,
  saving,
}: {
  checklist?: Checklist;
  onSave: (checklist: Omit<Checklist, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState(checklist?.title ?? '');
  const [description, setDescription] = useState(checklist?.description ?? '');
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>(checklist?.reviewStatus ?? 'draft');
  const [reviewerNotes, setReviewerNotes] = useState(checklist?.reviewerNotes ?? '');
  const [steps, setSteps] = useState<ChecklistStep[]>(checklist?.steps.map((step) => ({ ...step })) ?? []);
  const [error, setError] = useState('');

  function updateStep(index: number, patch: Partial<ChecklistStep>) {
    setSteps((current) => current.map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } : step));
  }

  function moveStep(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    setSteps((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    const cleanSteps = steps.map((step) => ({ ...step, title: step.title.trim(), description: step.description.trim() }));
    if (!cleanTitle) return setError('Enter a checklist title.');
    if (!cleanSteps.length) return setError('Add at least one step before saving.');
    if (cleanSteps.length > 100) return setError('A checklist can contain no more than 100 steps.');
    if (cleanSteps.some((step) => !step.title)) return setError('Add a title to every step.');
    setError('');
    await onSave({
      ...(checklist ? { id: checklist.id } : {}),
      title: cleanTitle,
      description: description.trim(),
      reviewStatus,
      reviewerNotes: reviewerNotes.trim(),
      steps: cleanSteps,
      ...(checklist?.archivedAt ? { archivedAt: checklist.archivedAt } : {}),
    });
  }

  return (
    <>
      <PageHeader
        eyebrow={checklist ? 'Edit checklist' : 'New checklist'}
        title={checklist ? 'Checklist details' : 'Create a checklist'}
        description="Enter only procedure content reviewed by qualified nursing faculty against current institutional protocols. No sample steps are supplied."
      />
      <form className="editor-form" onSubmit={save}>
        <div className="form-section">
          <label className="field-label" htmlFor="checklist-title">Checklist title <span className="required-mark">*</span></label>
          <input id="checklist-title" className="text-input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} required autoFocus placeholder="Enter an instructor-reviewed procedure title" disabled={saving} />
          <label className="field-label" htmlFor="checklist-description">Description <span className="muted">(optional)</span></label>
          <textarea id="checklist-description" className="text-input textarea" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={300} rows={3} placeholder="Brief context for this supervised simulation" disabled={saving} />
        </div>

        <div className="form-section">
          <div className="section-title-row">
            <div>
              <h2>Ordered steps</h2>
              <p className="muted">Steps are entered by you; MINDSYNC does not supply clinical instructions.</p>
            </div>
            <Button type="button" variant="secondary" icon={faPlus} onClick={() => setSteps((current) => [...current, newStep()])} disabled={saving || steps.length >= 100}>Add step</Button>
          </div>
          {steps.length === 0 ? (
            <div className="step-editor-empty">No steps yet. Add a blank step, then enter faculty-reviewed content.</div>
          ) : (
            <div className="step-editor-list">
              {steps.map((step, index) => (
                <fieldset className="step-editor-card" key={step.id} disabled={saving}>
                  <legend>Step {index + 1}</legend>
                  <div className="step-editor-topline">
                    <span className="step-number">{String(index + 1).padStart(2, '0')}</span>
                    <div className="step-order-actions">
                      <button type="button" className="text-icon-button" onClick={() => moveStep(index, -1)} disabled={saving || index === 0} aria-label={`Move step ${index + 1} up`}><AppIcon icon={faArrowUp} /></button>
                      <button type="button" className="text-icon-button" onClick={() => moveStep(index, 1)} disabled={saving || index === steps.length - 1} aria-label={`Move step ${index + 1} down`}><AppIcon icon={faArrowDown} /></button>
                      <button type="button" className="text-icon-button danger-text" onClick={() => setSteps((current) => current.filter((_, i) => i !== index))} disabled={saving} aria-label={`Remove step ${index + 1}`}>Remove</button>
                    </div>
                  </div>
                  <label className="field-label" htmlFor={`step-title-${step.id}`}>Step title <span className="required-mark">*</span></label>
                  <input id={`step-title-${step.id}`} className="text-input" value={step.title} onChange={(event) => updateStep(index, { title: event.target.value })} maxLength={140} required placeholder="Enter a reviewed step title" />
                  <label className="field-label" htmlFor={`step-description-${step.id}`}>Step detail <span className="muted">(optional)</span></label>
                  <textarea id={`step-description-${step.id}`} className="text-input textarea" value={step.description} onChange={(event) => updateStep(index, { description: event.target.value })} maxLength={500} rows={2} placeholder="Optional context from the reviewed procedure" />
                  <div className="step-options">
                    <label className="check-control"><input type="checkbox" checked={step.required} onChange={(event) => updateStep(index, { required: event.target.checked })} /> Required to complete the session</label>
                    <label className="check-control"><input type="checkbox" checked={step.attention} onChange={(event) => updateStep(index, { attention: event.target.checked })} /> Mark for extra attention (set by reviewer)</label>
                  </div>
                </fieldset>
              ))}
            </div>
          )}
        </div>

        <div className="form-section">
          <h2>Review status</h2>
          <label className="field-label" htmlFor="review-status">Checklist status</label>
          <select id="review-status" className="text-input" value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value as ReviewStatus)} disabled={saving}>
            {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <p className="safety-inline">“Approved for Simulation” is an administrative label only. It does not verify reviewer qualifications or establish clinical/regulatory approval. The study plan calls for review by at least two qualified nursing evaluators.</p>
          <label className="field-label" htmlFor="reviewer-notes">Reviewer notes <span className="muted">(optional)</span></label>
          <textarea id="reviewer-notes" className="text-input textarea" value={reviewerNotes} onChange={(event) => setReviewerNotes(event.target.value)} maxLength={1000} rows={3} placeholder="Internal notes about review status" disabled={saving} />
          <p className="field-help">These notes are stored separately and visible only to researcher accounts.</p>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions">
          <Button type="button" variant="quiet" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save checklist'}</Button>
        </div>
      </form>
    </>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}
