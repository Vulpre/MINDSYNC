export type ReviewStatus = 'draft' | 'awaiting_review' | 'approved_for_simulation';
export type SessionStatus = 'active' | 'paused' | 'completed' | 'ended_incomplete';
export type AppSection = 'home' | 'checklists' | 'sessions' | 'reports' | 'privacy';

export interface ChecklistStep {
  id: string;
  title: string;
  description: string;
  required: boolean;
  attention: boolean;
}

export interface Checklist {
  id: string;
  title: string;
  description: string;
  reviewStatus: ReviewStatus;
  reviewerNotes: string;
  steps: ChecklistStep[];
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface SessionSnapshot {
  checklistId: string;
  title: string;
  reviewStatus: ReviewStatus;
  steps: ChecklistStep[];
}

export interface ChecklistSession {
  id: string;
  checklist: SessionSnapshot;
  participantId: string;
  status: SessionStatus;
  currentStepIndex: number;
  completedStepIds: string[];
  stepNotes: Record<string, string>;
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
}

export const EVALUATION_QUESTIONS = [
  {
    id: 'ease',
    text: 'The checklist was easy to use.',
  },
  {
    id: 'learnability',
    text: 'I could learn how to use MINDSYNC quickly.',
  },
  {
    id: 'clarity',
    text: 'The instructions and step labels were clear.',
  },
  {
    id: 'tracking',
    text: 'The checklist helped me track completed and remaining steps during this simulation.',
  },
  {
    id: 'functionality',
    text: 'The features worked as expected.',
  },
  {
    id: 'acceptability',
    text: 'I would consider using a checklist tool like this during supervised skills-lab practice.',
  },
] as const;

export type EvaluationQuestionId = (typeof EVALUATION_QUESTIONS)[number]['id'];

export interface EvaluationResponse {
  id: string;
  sessionId: string;
  checklistTitle: string;
  participantId: string;
  answers: Partial<Record<EvaluationQuestionId, 1 | 2 | 3 | 4 | 5>>;
  workedWell: string;
  confusing: string;
  improve: string;
  createdAt: string;
}

export interface AppData {
  version: 1;
  checklists: Checklist[];
  sessions: ChecklistSession[];
  evaluations: EvaluationResponse[];
}

export const EMPTY_APP_DATA: AppData = {
  version: 1,
  checklists: [],
  sessions: [],
  evaluations: [],
};
