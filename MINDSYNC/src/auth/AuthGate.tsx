import { useState, type FormEvent } from 'react';
import { faArrowRightToBracket, faUserGraduate, faRotateRight, faShieldHalved } from '@fortawesome/free-solid-svg-icons';
import { AppIcon, Button, SafetyNotice } from '../components/ui';
import { useAuth } from './AuthProvider';

export function AuthGate() {
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setLocalError('');
    try {
      await auth.signInResearcher(email, password);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Unable to sign in. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function enterLearnerMode() {
    setBusy(true);
    setLocalError('');
    try {
      await auth.continueAsLearner();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Unable to start an anonymous learner session.');
    } finally {
      setBusy(false);
    }
  }

  async function exitCurrentSession() {
    setBusy(true);
    try {
      await auth.signOut();
      setLocalError('');
      setEmail('');
      setPassword('');
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Unable to sign out. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!auth.configured) {
    return (
      <AccessLayout>
        <section className="auth-card" aria-labelledby="auth-title">
          <p className="eyebrow">Connection setup</p>
          <h1 id="auth-title">MINDSYNC is not connected yet</h1>
          <p className="auth-description">Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> in the local environment or Vercel project settings, then rebuild. Use only the Supabase Publishable key, never a secret or service-role key.</p>
          <p className="safety-inline">The database schema, Auth settings, and row-level security migration must also be applied before this app can load shared data.</p>
        </section>
      </AccessLayout>
    );
  }

  if (auth.status === 'loading') {
    return (
      <AccessLayout>
        <section className="auth-card auth-loading" role="status" aria-live="polite">
          <span className="auth-spinner" aria-hidden="true" />
          <p>Checking MINDSYNC access…</p>
        </section>
      </AccessLayout>
    );
  }

  const error = localError || auth.error;
  const setupError = auth.status === 'setup_error';

  return (
    <AccessLayout>
      <section className="auth-card" aria-labelledby="auth-title">
        <p className="eyebrow">Research workspace</p>
        <h1 id="auth-title">Access MINDSYNC</h1>
        <p className="auth-description">Researchers sign in with an account provisioned by the project owner. Learners can continue anonymously without an email or password.</p>

        {error && <div className="auth-error" role="alert">{error}</div>}

        {setupError && auth.user ? (
          <div className="auth-actions-stack">
            <Button variant="secondary" icon={faRotateRight} onClick={() => void auth.refresh()} disabled={busy}>Try again</Button>
            <Button variant="quiet" onClick={() => void exitCurrentSession()} disabled={busy}>Sign out</Button>
          </div>
        ) : (
          <>
            <form className="auth-form" onSubmit={signIn}>
              <h2>Researcher sign in</h2>
              <label className="field-label" htmlFor="researcher-email">Email</label>
              <input id="researcher-email" className="text-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" maxLength={254} required />
              <label className="field-label" htmlFor="researcher-password">Password</label>
              <input id="researcher-password" className="text-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
              <Button type="submit" variant="primary" icon={faArrowRightToBracket} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
              <p className="auth-footnote">Researcher accounts are created and assigned by the project owner. There is no public researcher sign-up.</p>
            </form>

            <div className="auth-divider"><span>or</span></div>
            <div className="auth-learner-entry">
              <Button variant="secondary" icon={faUserGraduate} onClick={() => void enterLearnerMode()} disabled={busy}>{busy ? 'Connecting…' : 'Continue as learner'}</Button>
              <p className="auth-footnote">Learner access is anonymous and tied to this browser. Keep this browser's site data to resume later.</p>
            </div>
          </>
        )}
      </section>
    </AccessLayout>
  );
}

function AccessLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-page">
      <div className="auth-brand">
        <span className="brand-symbol" aria-hidden="true"><span /><span /><b /></span>
        <span className="brand-name">MINDSYNC<small>CLINICAL CHECKLIST</small></span>
      </div>
      <SafetyNotice />
      {children}
      <p className="auth-safety-note"><AppIcon icon={faShieldHalved} /> Do not enter patient-identifying or sensitive information.</p>
    </main>
  );
}
