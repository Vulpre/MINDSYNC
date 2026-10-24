import type { AppData, Checklist, ChecklistSession, EvaluationQuestionId, EvaluationResponse, ReviewStatus, SessionStatus, SessionSnapshot, ChecklistStep } from '../types';
import type { UserRole } from '../auth/AuthProvider';
import { supabase } from './supabaseClient';

interface DbChecklist {
  id: string;
  title: string;
  description: string;
  review_status: ReviewStatus;
  steps: unknown;
  sort_order: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

interface DbSession {
  id: string;
  checklist_id: string | null;
  checklist_snapshot: unknown;
  participant_id: string;
  status: SessionStatus;
  current_step_index: number;
  completed_step_ids: unknown;
  step_notes: unknown;
  started_at: string;
  updated_at: string;
  ended_at: string | null;
}

interface DbEvaluation {
  id: string;
  session_id: string;
  checklist_title: string;
  participant_id: string;
  answers: unknown;
  worked_well: string | null;
  confusing: string | null;
  improve: string | null;
  created_at: string;
}

const answerIds: EvaluationQuestionId[] = ['ease', 'learnability', 'clarity', 'tracking', 'functionality', 'acceptability'];
const CHECKLIST_COLUMNS = 'id, title, description, review_status, steps, sort_order, created_at, updated_at, archived_at';
const SESSION_COLUMNS = 'id, checklist_id, checklist_snapshot, participant_id, status, current_step_index, completed_step_ids, step_notes, started_at, updated_at, ended_at';
const EVALUATION_COLUMNS = 'id, session_id, checklist_title, participant_id, answers, worked_well, confusing, improve, created_at';

function client() {
  if (!supabase) throw new Error('Supabase is not configured. Add the VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY settings, then reload.');
  return supabase;
}

function throwIfError(error: { message: string } | null, action: string): void {
  if (error) throw new Error(`${action}: ${error.message}`);
}

function mapStep(value: unknown): ChecklistStep {
  const step = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    id: typeof step.id === 'string' ? step.id : '',
    title: typeof step.title === 'string' ? step.title : '',
    description: typeof step.description === 'string' ? step.description : '',
    required: step.required !== false,
    attention: step.attention === true,
  };
}

function mapChecklist(row: DbChecklist, reviewerNotes = ''): Checklist {
  const steps = Array.isArray(row.steps) ? row.steps.map(mapStep) : [];
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    reviewStatus: row.review_status,
    reviewerNotes,
    steps,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.archived_at ? { archivedAt: row.archived_at } : {}),
  };
}

function mapSession(row: DbSession): ChecklistSession {
  const snapshot = row.checklist_snapshot && typeof row.checklist_snapshot === 'object'
    ? row.checklist_snapshot as Record<string, unknown>
    : {};
  const checklist: SessionSnapshot = {
    checklistId: typeof snapshot.checklistId === 'string' ? snapshot.checklistId : row.checklist_id ?? '',
    title: typeof snapshot.title === 'string' ? snapshot.title : 'Checklist unavailable',
    reviewStatus: (snapshot.reviewStatus === 'draft' || snapshot.reviewStatus === 'awaiting_review' || snapshot.reviewStatus === 'approved_for_simulation')
      ? snapshot.reviewStatus
      : 'draft',
    steps: Array.isArray(snapshot.steps) ? snapshot.steps.map(mapStep) : [],
  };
  const completed = Array.isArray(row.completed_step_ids)
    ? row.completed_step_ids.filter((id): id is string => typeof id === 'string')
    : [];
  const notes = row.step_notes && typeof row.step_notes === 'object' && !Array.isArray(row.step_notes)
    ? Object.fromEntries(Object.entries(row.step_notes as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    : {};

  return {
    id: row.id,
    checklist,
    participantId: row.participant_id ?? '',
    status: row.status,
    currentStepIndex: row.current_step_index,
    completedStepIds: completed,
    stepNotes: notes,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    ...(row.ended_at ? { endedAt: row.ended_at } : {}),
  };
}

function mapAnswers(value: unknown): EvaluationResponse['answers'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const answers: EvaluationResponse['answers'] = {};
  for (const key of answerIds) {
    const score = source[key];
    if (typeof score === 'number' && Number.isInteger(score) && score >= 1 && score <= 5) answers[key] = score as 1 | 2 | 3 | 4 | 5;
  }
  return answers;
}

function mapEvaluation(row: DbEvaluation): EvaluationResponse {
  return {
    id: row.id,
    sessionId: row.session_id,
    checklistTitle: row.checklist_title,
    participantId: row.participant_id ?? '',
    answers: mapAnswers(row.answers),
    workedWell: row.worked_well ?? '',
    confusing: row.confusing ?? '',
    improve: row.improve ?? '',
    createdAt: row.created_at,
  };
}

export async function loadWorkspaceData(role: UserRole): Promise<AppData> {
  const db = client();
  let checklistQuery = db.from('checklists').select(CHECKLIST_COLUMNS);
  const sessionQuery = db.from('sessions').select(SESSION_COLUMNS);
  const evaluationQuery = db.from('evaluations').select(EVALUATION_COLUMNS);

  if (role === 'learner') {
    checklistQuery = checklistQuery.eq('review_status', 'approved_for_simulation').is('archived_at', null);
  }

  const [checklistsResult, sessionsResult, evaluationsResult] = await Promise.all([
    checklistQuery.order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
    sessionQuery.order('started_at', { ascending: false }),
    evaluationQuery.order('created_at', { ascending: false }),
  ]);

  throwIfError(checklistsResult.error, 'Could not load checklists');
  throwIfError(sessionsResult.error, 'Could not load sessions');
  throwIfError(evaluationsResult.error, 'Could not load feedback');

  const checklistRows = (checklistsResult.data ?? []) as unknown as DbChecklist[];
  let notesByChecklist = new Map<string, string>();
  if (role === 'researcher' && checklistRows.length > 0) {
    const notesResult = await db
      .from('checklist_review_notes')
      .select('checklist_id, reviewer_notes')
      .in('checklist_id', checklistRows.map((row) => row.id));
    throwIfError(notesResult.error, 'Could not load private review notes');
    notesByChecklist = new Map((notesResult.data ?? []).map((row) => [row.checklist_id as string, row.reviewer_notes as string]));
  }

  return {
    version: 1,
    checklists: checklistRows.map((row) => mapChecklist(row, notesByChecklist.get(row.id) ?? '')),
    sessions: ((sessionsResult.data ?? []) as unknown as DbSession[]).map(mapSession),
    evaluations: ((evaluationsResult.data ?? []) as unknown as DbEvaluation[]).map(mapEvaluation),
  };
}

export async function saveChecklist(checklist: Checklist, sortOrder: number): Promise<void> {
  const db = client();
  const { data, error } = await db.rpc('save_researcher_checklist', {
    p_id: checklist.id,
    p_title: checklist.title,
    p_description: checklist.description,
    p_review_status: checklist.reviewStatus,
    p_steps: checklist.steps,
    p_sort_order: sortOrder,
    p_archived_at: checklist.archivedAt ?? null,
    p_reviewer_notes: checklist.reviewerNotes,
  });
  throwIfError(error, 'Could not save checklist');
  if (!data) throw new Error('Checklist save was not confirmed by the database. Try again.');
}

export async function updateChecklistOrder(checklistIds: string[]): Promise<void> {
  const db = client();
  for (const [index, id] of checklistIds.entries()) {
    const { error } = await db.from('checklists').update({ sort_order: index }).eq('id', id).select('id').single();
    throwIfError(error, 'Could not save checklist order');
  }
}

export async function setChecklistArchived(checklistId: string, archived: boolean): Promise<void> {
  const db = client();
  const { error } = await db
    .from('checklists')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', checklistId)
    .select('id')
    .single();
  throwIfError(error, archived ? 'Could not archive checklist' : 'Could not restore checklist');
}

export async function createSession(session: ChecklistSession): Promise<ChecklistSession> {
  const db = client();
  const { data, error } = await db.from('sessions').insert({
    id: session.id,
    checklist_id: session.checklist.checklistId,
    checklist_snapshot: session.checklist,
    participant_id: session.participantId,
    status: session.status,
    current_step_index: session.currentStepIndex,
    completed_step_ids: session.completedStepIds,
    step_notes: session.stepNotes,
  }).select(SESSION_COLUMNS).single();
  throwIfError(error, 'Could not start session');
  if (!data) throw new Error('The session was not confirmed by the database. Try again.');
  return mapSession(data as unknown as DbSession);
}

export async function updateSession(session: ChecklistSession): Promise<ChecklistSession> {
  const db = client();
  const { data, error } = await db
    .from('sessions')
    .update({
      current_step_index: session.currentStepIndex,
      completed_step_ids: session.completedStepIds,
      step_notes: session.stepNotes,
      status: session.status,
    })
    .eq('id', session.id)
    .select(SESSION_COLUMNS)
    .single();
  throwIfError(error, 'Could not save session progress');
  if (!data) throw new Error('Session progress was not confirmed by the database. Try again.');
  return mapSession(data as unknown as DbSession);
}

export async function submitEvaluation(response: EvaluationResponse): Promise<EvaluationResponse> {
  const db = client();
  const { data, error } = await db.from('evaluations').insert({
    id: response.id,
    session_id: response.sessionId,
    checklist_title: response.checklistTitle,
    participant_id: response.participantId,
    answers: response.answers,
    worked_well: response.workedWell || null,
    confusing: response.confusing || null,
    improve: response.improve || null,
  }).select(EVALUATION_COLUMNS).single();
  throwIfError(error, 'Could not submit feedback');
  if (!data) throw new Error('Feedback was not confirmed by the database. Try again.');
  return mapEvaluation(data as unknown as DbEvaluation);
}
