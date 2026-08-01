import Cookies from "js-cookie";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  getTokenExpiry,
  getUserIdFromToken,
  login as apiLogin,
  refresh as apiRefresh,
} from "../api/auth";
import { COOKIE_NAME } from "../api/client";

// Sliding session: user activity exchanges the current token for a fresh one
// via /token/refresh, at most once per REFRESH_THROTTLE_MS. The token's own
// expiry is the inactivity timeout, and the API refuses to refresh past an
// absolute session cap — so the client never holds credentials after login,
// and the session survives reloads because refresh needs only the token.
const REFRESH_THROTTLE_MS = 5 * 60 * 1000;

// The cookie carries a bearer JWT, so it must never cross the wire in plaintext.
// Conditional rather than always-on because local dev is served over http, where
// a Secure cookie would silently fail to set and break login entirely.
// SameSite stays "lax" (not "strict") so arriving from an external share link
// doesn't present the app as logged out. No `expires` here: each cookie's
// lifetime is derived from its token's exp claim, so the two cannot drift.
const COOKIE_OPTIONS = {
  secure: window.location.protocol === "https:",
  sameSite: "lax",
} as const;

// The cookie is attacker-writable in the worst case, so parse defensively;
// a garbage token reads as "no session" instead of crashing the app shell.
function usernameFrom(token: string | null): string | null {
  if (!token) return null;
  try {
    return getUserIdFromToken(token);
  } catch {
    return null;
  }
}

function expiryFrom(token: string): Date | null {
  try {
    return getTokenExpiry(token);
  } catch {
    return null;
  }
}

interface AuthContextValue {
  username: string | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => Cookies.get(COOKIE_NAME) ?? null);
  // Mirror of `token` for the activity listener, which must not re-subscribe
  // (and so re-render) on every token change.
  const tokenRef = useRef(token);
  const lastRefreshRef = useRef(0);
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logout = useCallback(() => {
    Cookies.remove(COOKIE_NAME);
    tokenRef.current = null;
    setToken(null);
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
  }, []);

  // Installs a token and schedules a logout for the moment it expires. An
  // active user refreshes long before then; the timer only fires when idle.
  const applyToken = useCallback(
    (newToken: string) => {
      const expiry = expiryFrom(newToken);
      Cookies.set(COOKIE_NAME, newToken, { ...COOKIE_OPTIONS, expires: expiry ?? undefined });
      tokenRef.current = newToken;
      setToken(newToken);
      if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = expiry ? setTimeout(logout, expiry.getTime() - Date.now()) : null;
    },
    [logout],
  );

  const refreshSession = useCallback(async () => {
    lastRefreshRef.current = Date.now();
    try {
      applyToken(await apiRefresh());
    } catch {
      logout();
    }
  }, [applyToken, logout]);

  const login = useCallback(
    async (rawUsername: string, rawPassword: string) => {
      const newToken = await apiLogin(rawUsername, rawPassword);
      lastRefreshRef.current = Date.now();
      applyToken(newToken);
    },
    [applyToken],
  );

  // Slide the session on real activity, at most once per throttle window.
  useEffect(() => {
    const onActivity = () => {
      if (!tokenRef.current) return;
      if (Date.now() - lastRefreshRef.current < REFRESH_THROTTLE_MS) return;
      void refreshSession();
    };
    window.addEventListener("mousemove", onActivity);
    window.addEventListener("keydown", onActivity);
    return () => {
      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("keydown", onActivity);
    };
  }, [refreshSession]);

  // A reload resumes the session by refreshing the saved token immediately:
  // still valid → fresh token and expiry timer; expired or refused → logout.
  useEffect(() => {
    if (tokenRef.current) void refreshSession();
  }, [refreshSession]);

  useEffect(
    () => () => {
      if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
    },
    [],
  );

  return (
    <AuthContext.Provider
      value={{
        username: usernameFrom(token),
        token,
        isAuthenticated: !!token,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
