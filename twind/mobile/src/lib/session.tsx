/**
 * Session context: exposes the current JWT presence and drives the auth gate.
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { getToken, subscribeToken } from './auth';

type Session = { ready: boolean; signedIn: boolean };

const SessionContext = createContext<Session>({ ready: false, signedIn: false });

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Session>({ ready: false, signedIn: false });

  useEffect(() => {
    let mounted = true;
    void getToken().then((t) => {
      if (mounted) setState({ ready: true, signedIn: !!t });
    });
    const unsub = subscribeToken((t) => {
      if (mounted) setState({ ready: true, signedIn: !!t });
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  return useContext(SessionContext);
}
