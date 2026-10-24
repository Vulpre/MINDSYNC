import { useState, type FormEvent } from 'react';
import { Button, PageHeader } from '../../components/ui';
import { EVALUATION_QUESTIONS, type ChecklistSession, type EvaluationQuestionId, type EvaluationResponse } from '../../types';
import { createId } from '../../lib/storage';

const scale = [
  { value: 1, label: 'Strongly disagree' },
  { value: 2, label: 'Disagree' },
  { value: 3, label: 'Neither' },
  { value: 4, label: 'Agree' },
  { value: 5, label: 'Strongly agree' },
] as const;

export function EvaluationForm({
  session,
  onSubmit,
  onCancel,
  saving,
}: {
  session: ChecklistSession;
  onSubmit: (response: EvaluationResponse) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}) {
  const [answers, setAnswers] = useState<Partial<Record<EvaluationQuestionId, 1 | 2 | 3 | 4 | 5>>>({});
  const [workedWell, setWorkedWell] = useState('');
  const [confusing, setConfusing] = useState('');
  const [improve, setImprove] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (EVALUATION_QUESTIONS.some((question) => !answers[question.id])) {
      setError('Please choose a response for each statement, or skip this optional evaluation.');
      return;
    }
    if (!consent) {
      setError('Please confirm the participation statement before submitting feedback.');
      return;
    }
    await onSubmit({
      id: createId(),
      sessionId: session.id,
      checklistTitle: session.checklist.title,
      participantId: session.participantId,
      answers,
      workedWell: workedWell.trim(),
      confusing: confusing.trim(),
      improve: improve.trim(),
      createdAt: new Date().toISOString(),
    });
  }

  return (
    <>
      <PageHeader eyebrow="Optional prototype feedback" title="Tell us how MINDSYNC worked for you" description={`Your response relates to “${session.checklist.title}”. Do not include names, patient details, or other sensitive information.`} />
      <form className="evaluation-form" onSubmit={submit}>
        <div className="scale-legend"><span>1 · Strongly disagree</span><span>5 · Strongly agree</span></div>
        {EVALUATION_QUESTIONS.map((question, index) => (
          <fieldset className="likert-question" key={question.id}>
            <legend><span className="question-number">{String(index + 1).padStart(2, '0')}</span>{question.text}</legend>
            <div className="likert-options">
              {scale.map((option) => (
                <label className="likert-option" key={option.value}>
                  <input
                    type="radio"
                    name={`question-${question.id}`}
                    value={option.value}
                    checked={answers[question.id] === option.value}
                    onChange={() => setAnswers((current) => ({ ...current, [question.id]: option.value }))}
                    required
                  />
                  <span className="likert-number">{option.value}</span>
                  <span className="likert-word">{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}

        <div className="form-section feedback-prompts">
          <h2>Optional comments</h2>
          <label className="field-label" htmlFor="worked-well">What worked well?</label>
          <textarea className="text-input textarea" id="worked-well" rows={3} maxLength={1000} value={workedWell} onChange={(event) => setWorkedWell(event.target.value)} placeholder="Share what helped you during the simulation" />
          <label className="field-label" htmlFor="confusing">What was confusing or difficult?</label>
          <textarea className="text-input textarea" id="confusing" rows={3} maxLength={1000} value={confusing} onChange={(event) => setConfusing(event.target.value)} placeholder="Describe anything unclear or difficult to use" />
          <label className="field-label" htmlFor="improve">What would you improve?</label>
          <textarea className="text-input textarea" id="improve" rows={3} maxLength={1000} value={improve} onChange={(event) => setImprove(event.target.value)} placeholder="Suggest an improvement" />
          <p className="safety-inline">Responses are for prototype evaluation and should be handled under the researchers’ approved study and consent procedures. Do not include identifying or sensitive information.</p>
        </div>

        <label className="consent-control">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
          <span>I understand this optional feedback is for prototype evaluation and will be handled according to the approved study and consent procedures. I have not included patient-identifying or sensitive information.</span>
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions">
          <Button type="button" variant="quiet" onClick={onCancel} disabled={saving}>Skip feedback</Button>
          <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Submitting…' : 'Submit feedback'}</Button>
        </div>
      </form>
    </>
  );
}
