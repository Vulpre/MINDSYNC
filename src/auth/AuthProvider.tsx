import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from '../lib/supabaseClient';

export type UserRole = 'researcher' | 'learner';
export type AuthStatus = 'unconfigured' | 'loading' | 'signed_out' | 'ready' | 'setup_error';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  role: UserRole | null;
  isAnonymous: boolean;
  error: string;
}

interface AuthContextValue extends AuthState {
  configured: boolean;
  signInResearcher: (email: string, password: string) => Promise<void>;
  continueAsLearner: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const initialState: AuthState = {
  status: supabaseConfigured ? 'loading' : 'unconfigured',
  user: null,
  role: null,
  isAnonymous: false,
  error: '',
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState);

  const loadProfile = useCallback(async (session: Session | null) => {
    if (!supabaseConfigured || !supabase) {
      setState({ status: 'unconfigured', user: null, role: null, isAnonymous: false, error: '' });
      return;
    }
    if (!session) {
      setState({ status: 'signed_out', user: null, role: null, isAnonymous: false, error: '' });
      return;
    }

    const isAnonymous = session.user.is_anonymous === true;
    setState({ status: 'loading', user: session.user, role: null, isAnonymous, error: '' });

    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (error) {
      setState({
        status: 'setup_error',
        user: session.user,
        role: null,
        isAnonymous,
        error: formatAuthError(error.message),
      });
      return;
    }

    if (!data || (data.role !== 'researcher' && data.role !== 'learner')) {
      setState({
        status: 'setup_error',
        user: session.user,
        role: null,
        isAnonymous,
        error: 'No MINDSYNC access profile was found. Apply the database migration and check the account setup.',
      });
      return;
    }

    const role = data.role as UserRole;
    if (isAnonymous && role !== 'learner') {
      setState({ status: 'setup_error', user: session.user, role: null, isAnonymous, error: 'Anonymous access is not assigned the expected learner role. Ask the project owner to review the Supabase setup.' });
      return;
    }
    if (!isAnonymous && role !== 'researcher') {
      setState({ status: 'setup_error', user: session.user, role: null, isAnonymous, error: 'This account is not assigned researcher access. Ask the project owner to verify its role.' });
      return;
    }

    setState({ status: 'ready', user: session.user, role, isAnonymous, error: '' });
  }, []);

  useEffect(() => {
    if (!supabaseConfigured || !supabase) {
      setState({ status: 'unconfigured', user: null, role: null, isAnonymous: false, error: '' });
      return;
    }

    let active = true;
    const applySession = (session: Session | null) => {
      if (active) void loadProfile(session);
    };

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setState({ status: 'setup_error', user: null, role: null, isAnonymous: false, error: formatAuthError(error.message) });
        return;
      }
      applySession(data.session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Defer profile reads until Supabase finishes its synchronous auth callback.
      window.setTimeout(() => applySession(session), 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signInResearcher = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase environment settings are missing.');
    setState((current) => ({ ...current, status: 'loading', error: '' }));
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      const message = formatAuthError(error.message);
      setState({ status: 'signed_out', user: null, role: null, isAnonymous: false, error: message });
      throw new Error(message);
    }
    await loadProfile(data.session);
  }, [loadProfile]);

  const continueAsLearner = useCallback(async () => {
    if (!supabase) throw new Error('Supabase environment settings are missing.');
    setState((current) => ({ ...current, status: 'loading', error: '' }));
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw new Error(formatAuthError(sessionError.message));

    if (sessionData.session?.user.is_anonymous) {
      await loadProfile(sessionData.session);
      return;
    }
    if (sessionData.session) {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw new Error(formatAuthError(signOutError.message));
    }

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      const message = formatAuthError(error.message);
      setState({ status: 'signed_out', user: null, role: null, isAnonymous: false, error: message });
      throw new Error(message);
    }
    await loadProfile(data.session);
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    setState((current) => ({ ...current, status: 'loading', error: '' }));
    const { error } = await supabase.auth.signOut();
    if (error) {
      setState((current) => ({ ...current, status: 'setup_error', error: formatAuthError(error.message) }));
      throw new Error(formatAuthError(error.message));
    }
    setState({ status: 'signed_out', user: null, role: null, isAnonymous: false, error: '' });
  }, []);

  const refresh = useCallback(async () => {
    if (!supabase) return;
    setState((current) => ({ ...current, status: 'loading', error: '' }));
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      setState({ status: 'setup_error', user: null, role: null, isAnonymous: false, error: formatAuthError(error.message) });
      return;
    }
    await loadProfile(data.session);
  }, [loadProfile]);

  const value = useMemo<AuthContextValue>(() => ({
    ...state,
    configured: supabaseConfigured,
    signInResearcher,
    continueAsLearner,
    signOut,
    refresh,
  }), [state, signInResearcher, continueAsLearner, signOut, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}

function formatAuthError(message: string): string {
  const value = message.toLowerCase();
  if (value.includes('invalid login credentials')) return 'The email or password is incorrect.';
  if (value.includes('anonymous') && (value.includes('disabled') || value.includes('not enabled'))) {
    return 'Anonymous learner access is not enabled in Supabase yet. Ask the project owner to enable it.';
  }
  if (value.includes('profiles') || value.includes('schema cache') || value.includes('relation')) {
    return 'The MINDSYNC database setup is not ready. Apply the SQL migration in Supabase, then try again.';
  }
  if (value.includes('failed to fetch') || value.includes('network')) {
    return 'Could not reach the Supabase project. Check the project URL and try again.';
  }
  return 'Could not complete sign-in. Check the Supabase Auth and database setup, then try again.';
}
