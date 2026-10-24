import { useCallback, useEffect, useState } from 'react';
import {
  faArrowRight,
  faChartColumn,
  faCheck,
  faCircleInfo,
  faClock,
  faHouse,
  faListCheck,
  faPlus,
  faRightFromBracket,
  faShieldHalved,
} from '@fortawesome/free-solid-svg-icons';
import { AppIcon, Button, EmptyState, Modal, SafetyNotice } from './components/ui';
import { AuthGate } from './auth/AuthGate';
import { useAuth, type UserRole } from './auth/AuthProvider';
import { ChecklistEditor, ChecklistLibrary } from './features/checklists/ChecklistLibrary';
import { EvaluationForm } from './features/evaluations/EvaluationForm';
import { Reports } from './features/reports/Reports';
import { SessionHistory } from './features/sessions/SessionHistory';
import { SessionReview, SessionSummary, SessionView } from './features/sessions/SessionViews';
import { clearAppData, createId, loadAppData } from './lib/storage';
import {
  createSession as persistSession,
  loadWorkspaceData,
  saveChecklist as persistChecklist,
  setChecklistArchived,
  submitEvaluation as persistEvaluation,
  updateChecklistOrder,
  updateSession as persistSessionUpdate,
} from './lib/repository';
import { EMPTY_APP_DATA, type AppData, type AppSection, type Checklist, type ChecklistSession, type EvaluationResponse } from './types';

type Screen =
  | { kind: 'section'; section: AppSection }
  | { kind: 'editor'; checklistId?: string }
  | { kind: 'session'; sessionId: string }
  | { kind: 'review'; sessionId: string }
  | { kind: 'summary'; sessionId: string }
  | { kind: 'evaluation'; sessionId: string };

type ChecklistDraft = Omit<Checklist, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };
type Toast = { message: string; error?: boolean };

const navItems: { id: AppSection; label: string; icon: typeof faHouse }[] = [
  { id: 'home', label: 'Home', icon: faHouse },
  { id: 'checklists', label: 'Checklists', icon: faListCheck },
  { id: 'sessions', label: 'Sessions', icon: faClock },
  { id: 'reports', label: 'Reports', icon: faChartColumn },
  { id: 'privacy', label: 'Data & privacy', icon: faShieldHalved },
];

function sectionScreen(section: AppSection): Screen {
  return { kind: 'section', section };
}

export default function App() {
  const auth = useAuth();
  if (auth.status !== 'ready' || !auth.user || !auth.role) return <AuthGate />;
  return <Workspace key={auth.user.id} role={auth.role} isAnonymous={auth.isAnonymous} />;
}

function Workspace({ role, isAnonymous }: { role: UserRole; isAnonymous: boolean }) {
  const auth = useAuth();
  const isResearcher = role === 'researcher';
  const [data, setData] = useState<AppData>(EMPTY_APP_DATA);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [writing, setWriting] = useState(false);
  const [screen, setScreen] = useState<Screen>(() => sectionScreen('home'));
  const [pendingChecklist, setPendingChecklist] = useState<Checklist | null>(null);
  const [participantId, setParticipantId] = useState('');
  const [pendingClear, setPendingClear] = useState(false);
  const [legacyData, setLegacyData] = useState<AppData>(() => loadAppData());
  const [toast, setToast] = useState<Toast | null>(null);

  const reloadData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const loaded = await loadWorkspaceData(role);
      setData(loaded);
      return true;
    } catch (error) {
      setLoadError(messageOf(error, 'Could not load MINDSYNC data from Supabase.'));
      return false;
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    void reloadData();
  }, [reloadData]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const activeChecklists = data.checklists.filter((checklist) => !checklist.archivedAt);
  const selectedChecklist = screen.kind === 'editor' && screen.checklistId
    ? data.checklists.find((checklist) => checklist.id === screen.checklistId)
    : undefined;
  const activeSession = 'sessionId' in screen
    ? data.sessions.find((session) => session.id === screen.sessionId)
    : undefined;
  const legacyCount = legacyData.checklists.length + legacyData.sessions.length + legacyData.evaluations.length;

  function navigate(section: AppSection) {
    if (section === 'reports' && !isResearcher) return;
    setScreen(sectionScreen(section));
  }

  async function saveChecklist(draft: ChecklistDraft) {
    if (!isResearcher) return;
    const now = new Date().toISOString();
    const previous = draft.id ? data.checklists.find((item) => item.id === draft.id) : undefined;
    const checklist: Checklist = {
      ...draft,
      id: previous?.id ?? draft.id ?? createId(),
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    const sortOrder = previous
      ? Math.max(0, data.checklists.findIndex((item) => item.id === previous.id))
      : activeChecklists.length;

    setWriting(true);
    try {
      await persistChecklist(checklist, sortOrder);
      setData((current) => ({
        ...current,
        checklists: previous
          ? current.checklists.map((item) => item.id === checklist.id ? checklist : item)
          : [...current.checklists, checklist],
      }));
      setScreen(sectionScreen('checklists'));
      setToast({ message: previous ? 'Checklist updated.' : 'Checklist created.' });
    } catch (error) {
      setToast({ message: messageOf(error, 'Checklist was not saved. Try again.'), error: true });
    } finally {
      setWriting(false);
    }
  }

  async function duplicateChecklist(checklist: Checklist) {
    if (!isResearcher) return;
    const now = new Date().toISOString();
    const duplicate: Checklist = {
      ...checklist,
      id: createId(),
      title: `${checklist.title} (copy)`,
      reviewStatus: 'draft',
      reviewerNotes: '',
      steps: checklist.steps.map((step) => ({ ...step, id: createId() })),
      createdAt: now,
      updatedAt: now,
      archivedAt: undefined,
    };
    setWriting(true);
    try {
      await persistChecklist(duplicate, activeChecklists.length);
      setData((current) => ({ ...current, checklists: [...current.checklists, duplicate] }));
      setToast({ message: 'Checklist duplicated as a draft.' });
    } catch (error) {
      setToast({ message: messageOf(error, 'Checklist was not duplicated.'), error: true });
    } finally {
      setWriting(false);
    }
  }

  async function moveChecklist(checklistId: string, direction: -1 | 1) {
    if (!isResearcher) return;
    const active = [...data.checklists.filter((item) => !item.archivedAt)];
    const archived = data.checklists.filter((item) => item.archivedAt);
    const index = active.findIndex((item) => item.id === checklistId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= active.length) return;
    [active[index], active[target]] = [active[target], active[index]];
    const reordered = [...active, ...archived];

    setWriting(true);
    try {
      await updateChecklistOrder(reordered.map((item) => item.id));
      setData((current) => ({ ...current, checklists: reordered }));
    } catch (error) {
      setToast({ message: messageOf(error, 'Checklist order was not saved.'), error: true });
      await reloadData();
    } finally {
      setWriting(false);
    }
  }

  async function archiveChecklist(checklist: Checklist) {
    if (!isResearcher || !window.confirm(`Archive “${checklist.title}”? Existing session records will remain unchanged.`)) return;
    setWriting(true);
    try {
      const archivedAt = new Date().toISOString();
      await setChecklistArchived(checklist.id, true);
      setData((current) => ({ ...current, checklists: current.checklists.map((item) => item.id === checklist.id ? { ...item, archivedAt, updatedAt: archivedAt } : item) }));
      setToast({ message: 'Checklist archived.' });
    } catch (error) {
      setToast({ message: messageOf(error, 'Checklist was not archived.'), error: true });
    } finally {
      setWriting(false);
    }
  }

  async function restoreChecklist(checklist: Checklist) {
    if (!isResearcher) return;
    setWriting(true);
    try {
      await setChecklistArchived(checklist.id, false);
      setData((current) => ({ ...current, checklists: current.checklists.map((item) => {
        if (item.id !== checklist.id) return item;
        const { archivedAt: _archivedAt, ...rest } = item;
        return { ...rest, updatedAt: new Date().toISOString() };
      }) }));
      setToast({ message: 'Checklist restored.' });
    } catch (error) {
      setToast({ message: messageOf(error, 'Checklist was not restored.'), error: true });
    } finally {
      setWriting(false);
    }
  }

  function requestStart(checklist: Checklist) {
    if (!isAnonymous || checklist.reviewStatus !== 'approved_for_simulation' || checklist.steps.length === 0 || checklist.archivedAt) return;
    setParticipantId('');
    setPendingChecklist(checklist);
  }

  async function startSession() {
    if (!pendingChecklist || !isAnonymous) return;
    const now = new Date().toISOString();
    const session: ChecklistSession = {
      id: createId(),
      checklist: {
        checklistId: pendingChecklist.id,
        title: pendingChecklist.title,
        reviewStatus: pendingChecklist.reviewStatus,
        steps: pendingChecklist.steps.map((step) => ({ ...step })),
      },
      participantId: participantId.trim(),
      status: 'active',
      currentStepIndex: 0,
      completedStepIds: [],
      stepNotes: {},
      startedAt: now,
      updatedAt: now,
    };
    setWriting(true);
    try {
      const saved = await persistSession(session);
      setData((current) => ({ ...current, sessions: [saved, ...current.sessions] }));
      setPendingChecklist(null);
      setScreen({ kind: 'session', sessionId: saved.id });
      setToast({ message: 'Simulation session started.' });
    } catch (error) {
      setToast({ message: messageOf(error, 'The session was not started. Check your connection and try again.'), error: true });
    } finally {
      setWriting(false);
    }
  }

  async function updateSession(sessionId: string, patch: Partial<ChecklistSession>): Promise<boolean> {
    if (!isAnonymous) return false;
    const current = data.sessions.find((session) => session.id === sessionId);
    if (!current) return false;
    const updated: ChecklistSession = { ...current, ...patch, updatedAt: new Date().toISOString() };
    setWriting(true);
    try {
      const saved = await persistSessionUpdate(updated);
      setData((previous) => ({ ...previous, sessions: previous.sessions.map((session) => session.id === sessionId ? saved : session) }));
      return true;
    } catch (error) {
      setToast({ message: messageOf(error, 'Progress was not saved. Check your connection and try again.'), error: true });
      return false;
    } finally {
      setWriting(false);
    }
  }

  async function pauseSession(session: ChecklistSession) {
    if (await updateSession(session.id, { status: 'paused' })) setToast({ message: 'Session paused. Your latest progress was saved.' });
  }

  async function resumeSession(session: ChecklistSession) {
    if (await updateSession(session.id, { status: 'active' })) setScreen({ kind: 'session', sessionId: session.id });
  }

  async function completeSession(session: ChecklistSession) {
    const requiredIncomplete = session.checklist.steps.some((step) => step.required && !session.completedStepIds.includes(step.id));
    if (requiredIncomplete) return;
    if (await updateSession(session.id, { status: 'completed', endedAt: new Date().toISOString() })) {
      setScreen({ kind: 'summary', sessionId: session.id });
    }
  }

  async function endIncomplete(session: ChecklistSession) {
    if (await updateSession(session.id, { status: 'ended_incomplete', endedAt: new Date().toISOString() })) {
      setScreen({ kind: 'summary', sessionId: session.id });
    }
  }

  async function saveEvaluation(response: EvaluationResponse) {
    const session = data.sessions.find((item) => item.id === response.sessionId);
    if (!isAnonymous || !session || (session.status !== 'completed' && session.status !== 'ended_incomplete')) {
      setToast({ message: 'Feedback is available only after the session has ended.', error: true });
      return;
    }
    setWriting(true);
    try {
      const saved = await persistEvaluation(response);
      setData((current) => ({ ...current, evaluations: [saved, ...current.evaluations] }));
      setScreen({ kind: 'summary', sessionId: saved.sessionId });
      setToast({ message: 'Feedback submitted. Thank you.' });
    } catch (error) {
      setToast({ message: messageOf(error, 'Feedback was not submitted. Try again.'), error: true });
    } finally {
      setWriting(false);
    }
  }

  async function openSession(session: ChecklistSession) {
    if (isResearcher) {
      setScreen({ kind: 'summary', sessionId: session.id });
      return;
    }
    if (session.status === 'active') {
      setScreen({ kind: 'session', sessionId: session.id });
      return;
    }
    if (session.status === 'paused') {
      if (await updateSession(session.id, { status: 'active' })) setScreen({ kind: 'session', sessionId: session.id });
      return;
    }
    setScreen({ kind: 'summary', sessionId: session.id });
  }

  function clearLegacyData() {
    clearAppData();
    setLegacyData(EMPTY_APP_DATA);
    setPendingClear(false);
    setToast({ message: 'Old browser-local data cleared. Shared Supabase records were not changed.' });
  }

  function downloadLegacyData() {
    const blob = new Blob([JSON.stringify(legacyData, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `mindsync-legacy-local-data-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function changeAccessMode() {
    if (isAnonymous) {
      const confirmed = window.confirm('Sign out of this anonymous learner identity? If you later clear this browser or switch devices, you may not be able to access its records again. The records will remain in Supabase.');
      if (!confirmed) return;
      try {
        await auth.signOut();
      } catch (error) {
        setToast({ message: messageOf(error, 'Unable to sign out.'), error: true });
      }
      return;
    }

    if (!window.confirm('Switch to a separate anonymous learner identity? This will sign out the researcher account first.')) return;
    try {
      await auth.continueAsLearner();
    } catch (error) {
      setToast({ message: messageOf(error, 'Could not start anonymous learner access.'), error: true });
    }
  }

  function renderScreen() {
    if (screen.kind === 'editor') {
      if (!isResearcher) return null;
      return <ChecklistEditor key={screen.checklistId ?? 'new'} checklist={selectedChecklist} onSave={saveChecklist} onCancel={() => navigate('checklists')} saving={writing} />;
    }

    if (screen.kind === 'session' && activeSession && isAnonymous) {
      return <SessionView
        session={activeSession}
        saving={writing}
        onUpdate={(patch) => updateSession(activeSession.id, patch)}
        onPause={() => pauseSession(activeSession)}
        onResume={() => resumeSession(activeSession)}
        onReview={() => setScreen({ kind: 'review', sessionId: activeSession.id })}
        onEnd={() => { void endIncomplete(activeSession); }}
      />;
    }

    if (screen.kind === 'review' && activeSession && isAnonymous) {
      return <SessionReview
        session={activeSession}
        saving={writing}
        onReturnToStep={async (index) => {
          if (await updateSession(activeSession.id, { currentStepIndex: index, status: 'active' })) setScreen({ kind: 'session', sessionId: activeSession.id });
        }}
        onComplete={() => { void completeSession(activeSession); }}
        onEnd={() => { void endIncomplete(activeSession); }}
      />;
    }

    if (screen.kind === 'summary' && activeSession && (isAnonymous || isResearcher)) {
      return <SessionSummary
        session={activeSession}
        hasEvaluation={data.evaluations.some((response) => response.sessionId === activeSession.id)}
        canEvaluate={isAnonymous && (activeSession.status === 'completed' || activeSession.status === 'ended_incomplete')}
        onEvaluate={() => setScreen({ kind: 'evaluation', sessionId: activeSession.id })}
        onHome={() => navigate('home')}
      />;
    }

    if (screen.kind === 'evaluation' && activeSession && isAnonymous) {
      return <EvaluationForm session={activeSession} onSubmit={saveEvaluation} onCancel={() => setScreen({ kind: 'summary', sessionId: activeSession.id })} saving={writing} />;
    }

    if (screen.kind === 'section') {
      switch (screen.section) {
        case 'home': return <Home role={role} checklists={activeChecklists} onCreate={() => setScreen({ kind: 'editor' })} onOpenChecklists={() => navigate('checklists')} onStart={requestStart} />;
        case 'checklists': return <ChecklistLibrary
          role={role}
          checklists={data.checklists}
          saving={writing}
          onCreate={() => setScreen({ kind: 'editor' })}
          onEdit={(checklist) => setScreen({ kind: 'editor', checklistId: checklist.id })}
          onDuplicate={(checklist) => { void duplicateChecklist(checklist); }}
          onMove={(checklist, direction) => { void moveChecklist(checklist.id, direction); }}
          onArchive={(checklist) => { void archiveChecklist(checklist); }}
          onRestore={(checklist) => { void restoreChecklist(checklist); }}
          onStart={requestStart}
        />;
        case 'sessions': return <SessionHistory sessions={data.sessions} role={role} saving={writing} onOpen={(session) => { void openSession(session); }} />;
        case 'reports': return isResearcher ? <Reports data={data} /> : null;
        case 'privacy': return <PrivacyPage role={role} legacyCount={legacyCount} onDownloadLegacy={downloadLegacyData} onClear={() => setPendingClear(true)} />;
      }
    }

    return <Home role={role} checklists={activeChecklists} onCreate={() => setScreen({ kind: 'editor' })} onOpenChecklists={() => navigate('checklists')} onStart={requestStart} />;
  }

  const visibleNav = navItems.filter((item) => isResearcher || item.id !== 'reports');
  const roleLabel = isResearcher ? 'Researcher workspace' : 'Anonymous learner';
  const quickActions = (
    <div className="mobile-header-actions">
      <Button variant="quiet" icon={faRightFromBracket} onClick={() => { void changeAccessMode(); }} disabled={writing}>
        {isResearcher ? 'Switch to learner' : 'Sign out'}
      </Button>
      {isResearcher && <Button variant="primary" icon={faPlus} onClick={() => setScreen({ kind: 'editor' })}>New checklist</Button>}
    </div>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand-lockup" type="button" onClick={() => navigate('home')} aria-label="MINDSYNC home">
          <span className="brand-symbol"><span /><span /><b /></span>
          <span className="brand-name">MINDSYNC<small>CLINICAL CHECKLIST</small></span>
        </button>
        <p className="nav-caption">WORKSPACE</p>
        <nav className="primary-nav" aria-label="Main navigation">
          {visibleNav.map((item) => {
            const active = screen.kind === 'section' && screen.section === item.id;
            return (
              <button className={`nav-item ${active ? 'nav-item-active' : ''}`} type="button" key={item.id} onClick={() => navigate(item.id)} aria-current={active ? 'page' : undefined}>
                <AppIcon icon={item.icon} /><span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-note"><span className="sidebar-note-mark"><AppIcon icon={faCircleInfo} /></span><p>Designed for supervised skills-lab practice.</p></div>
        <div className="account-panel">
          <span className="account-role"><span className="sidebar-dot" />{roleLabel}</span>
          <Button variant="quiet" icon={faRightFromBracket} onClick={() => { void changeAccessMode(); }} disabled={writing}>
            {isResearcher ? 'Switch to learner mode' : 'Sign out'}
          </Button>
        </div>
      </aside>

      <main className="workspace">
        <header className="mobile-header">
          <button className="brand-lockup" type="button" onClick={() => navigate('home')} aria-label="MINDSYNC home">
            <span className="brand-symbol"><span /><span /><b /></span>
            <span className="brand-name">MINDSYNC<small>CLINICAL CHECKLIST</small></span>
          </button>
          {quickActions}
        </header>
        <div className="workspace-content">
          <SafetyNotice />
          {loading ? (
            <div className="loading-panel" role="status" aria-live="polite"><span className="auth-spinner" aria-hidden="true" />Loading your MINDSYNC workspace…</div>
          ) : loadError ? (
            <section className="connection-error" role="alert">
              <AppIcon icon={faCircleInfo} />
              <h1>Could not load your workspace</h1>
              <p>{loadError}</p>
              <div className="inline-actions"><Button variant="primary" onClick={() => { void reloadData(); }}>Try again</Button><Button variant="quiet" onClick={() => { void auth.signOut(); }}>Sign out</Button></div>
            </section>
          ) : (
            <>
              <div className="screen-content">{renderScreen()}</div>
              <footer className="app-footer">MINDSYNC research prototype <span>·</span> Supabase-connected workspace <span>·</span> Do not enter patient information</footer>
            </>
          )}
        </div>
      </main>

      {pendingChecklist && isAnonymous && (
        <Modal title="Start a supervised simulation?" description={`You are starting “${pendingChecklist.title}”. Follow your instructor and the current institutional protocol throughout the simulation.`} onClose={() => setPendingChecklist(null)}>
          <label className="field-label" htmlFor="participant-id">Anonymous participant ID <span className="muted">(optional)</span></label>
          <input id="participant-id" className="text-input" value={participantId} onChange={(event) => setParticipantId(event.target.value)} maxLength={40} autoComplete="off" placeholder="Leave blank to continue without an ID" />
          <p className="safety-inline">Do not enter a name, patient identifier, or other sensitive information. This anonymous learner identity is tied to this browser.</p>
          <div className="modal-actions">
            <Button variant="quiet" onClick={() => setPendingChecklist(null)} disabled={writing}>Cancel</Button>
            <Button variant="primary" onClick={() => { void startSession(); }} disabled={writing}>{writing ? 'Starting…' : 'Start simulation'}</Button>
          </div>
        </Modal>
      )}

      {pendingClear && (
        <Modal title="Clear old browser-local records?" description="This removes only older MINDSYNC records saved in this browser. It does not delete shared Supabase checklists, sessions, or feedback." onClose={() => setPendingClear(false)}>
          <div className="modal-actions">
            <Button variant="quiet" onClick={() => setPendingClear(false)}>Cancel</Button>
            <Button variant="danger" onClick={clearLegacyData}>Clear local data</Button>
          </div>
        </Modal>
      )}

      {toast && <div className="toast" role={toast.error ? 'alert' : 'status'} aria-live={toast.error ? 'assertive' : 'polite'}>{toast.message}</div>}
    </div>
  );
}

function Home({ role, checklists, onCreate, onOpenChecklists, onStart }: {
  role: UserRole;
  checklists: Checklist[];
  onCreate: () => void;
  onOpenChecklists: () => void;
  onStart: (checklist: Checklist) => void;
}) {
  const isResearcher = role === 'researcher';
  return (
    <>
      <section className="home-intro">
        <div className="home-copy">
          <p className="eyebrow">{isResearcher ? 'Research workspace' : 'Nursing skills-lab companion'}</p>
          <h1>{isResearcher ? <>Prepare checklists<br /><em>for practice.</em></> : <>Keep each step<br /><em>in sight.</em></>}</h1>
          <p className="home-description">{isResearcher
            ? 'Create and maintain instructor-reviewed checklists. Learners see only active checklists marked Approved for Simulation.'
            : 'Work through an instructor-reviewed checklist during supervised simulation. Your session is associated with this anonymous browser identity.'}</p>
          <div className="home-actions">
            {isResearcher && <Button variant="primary" icon={faPlus} onClick={onCreate}>Create checklist</Button>}
            {checklists.length > 0 && <Button variant="quiet" onClick={onOpenChecklists}>{isResearcher ? 'Manage checklists' : 'View checklists'}</Button>}
          </div>
        </div>
        <div className="home-emblem" aria-hidden="true">
          <div className="emblem-ring emblem-ring-one" /><div className="emblem-ring emblem-ring-two" />
          <span className="emblem-check"><AppIcon icon={faCheck} /></span><span className="emblem-caption">STEP<br />BY STEP</span>
        </div>
      </section>
      {checklists.length === 0 ? (
        <EmptyState
          icon={faListCheck}
          title={isResearcher ? 'No checklists created yet' : 'No simulation checklists available'}
          description={isResearcher
            ? 'Start by adding a procedure checklist reviewed by your nursing faculty. MINDSYNC does not include prefilled procedures or sample sessions.'
            : 'A researcher must create and approve a checklist for supervised simulation before it appears here.'}
          action={isResearcher ? <Button variant="primary" icon={faPlus} onClick={onCreate}>Create your first checklist</Button> : undefined}
        />
      ) : (
        <section className="home-checklists">
          <div className="section-title-row"><div><p className="eyebrow">{isResearcher ? 'Your workspace' : 'Approved for simulation'}</p><h2>{isResearcher ? 'Your checklists' : 'Available checklists'}</h2></div><Button variant="quiet" icon={faArrowRight} onClick={onOpenChecklists}>{isResearcher ? 'Manage checklists' : 'View all checklists'}</Button></div>
          <div className="home-checklist-list">
            {checklists.slice(0, 3).map((checklist) => (
              <article className="home-checklist-row" key={checklist.id}>
                <span className="home-checklist-icon"><AppIcon icon={faListCheck} /></span>
                <span className="home-checklist-copy"><strong>{checklist.title}</strong><small>{checklist.steps.length} {checklist.steps.length === 1 ? 'step' : 'steps'} · {checklist.reviewStatus === 'approved_for_simulation' ? 'Available for supervised simulation' : 'Review required before simulation'}</small></span>
                {!isResearcher && checklist.reviewStatus === 'approved_for_simulation' && <Button variant="primary" icon={faArrowRight} onClick={() => onStart(checklist)}>Start</Button>}
              </article>
            ))}
          </div>
        </section>
      )}
      <section className="home-principles">
        <div><span className="principle-number">01</span><div><h3>One step at a time</h3><p>Mark each required step yourself before moving ahead.</p></div></div>
        <div><span className="principle-number">02</span><div><h3>Your progress, saved</h3><p>Return in this browser to resume the same anonymous learner identity.</p></div></div>
        <div><span className="principle-number">03</span><div><h3>Supports your practice</h3><p>Use with instructor supervision and current protocols.</p></div></div>
      </section>
    </>
  );
}

function PrivacyPage({ role, legacyCount, onDownloadLegacy, onClear }: {
  role: UserRole;
  legacyCount: number;
  onDownloadLegacy: () => void;
  onClear: () => void;
}) {
  const isResearcher = role === 'researcher';
  return (
    <>
      <div className="page-header"><div><p className="eyebrow">Prototype information</p><h1>Data & privacy</h1><p className="page-description">Understand how shared records and this browser's anonymous sign-in are handled.</p></div></div>
      <section className="panel privacy-panel">
        <div className="privacy-heading"><span className="privacy-icon"><AppIcon icon={faShieldHalved} /></span><div><h2>{isResearcher ? 'Research workspace access' : 'Anonymous learner access'}</h2><p>{isResearcher
          ? 'New checklist, session, and evaluation records are stored in the shared Supabase project. Researcher access is controlled by the account role and database row-level policies.'
          : 'Your sessions and submitted feedback are linked to an anonymous Supabase Auth identity so you can resume from this browser. Your email is not used for anonymous learner access.'}</p></div></div>
        <ul className="privacy-list">
          <li>Do not enter patient names, identifiers, health records, or other sensitive information.</li>
          <li>{isResearcher ? 'The researcher role can review shared study responses. Do not treat the workspace as a clinical record system.' : 'You can see only your own sessions and feedback. Researchers can review study responses under the approved study procedures.'}</li>
          <li>Signing out, clearing this browser's site data, or switching devices may make an anonymous learner identity inaccessible. Existing shared records are not automatically deleted.</li>
          <li>Use this prototype only for supervised skills-lab simulation; follow instructor-approved protocols.</li>
          <li>Study evaluation data should be handled under the researchers’ approved consent and data-management procedures.</li>
        </ul>
        <div className="legacy-data-panel">
          <div><strong>{legacyCount ? `${legacyCount} older browser-local record${legacyCount === 1 ? '' : 's'} found.` : 'No older browser-local records found.'}</strong><p className="muted small">Older records are not automatically imported into the shared database.</p></div>
          {legacyCount > 0 && <div className="legacy-data-actions"><Button variant="secondary" onClick={onDownloadLegacy}>Download old data JSON</Button><Button variant="danger" onClick={onClear}>Clear old local data</Button></div>}
        </div>
      </section>
      <section className="panel privacy-panel"><h2>About this research prototype</h2><p className="muted">MINDSYNC is a supplementary checklist interface for supervised nursing-skills-lab simulation. It is not clinically validated and does not replace nursing judgment, faculty supervision, or established institutional protocols. Checklist content must be reviewed by qualified nursing faculty before study evaluation.</p></section>
    </>
  );
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
