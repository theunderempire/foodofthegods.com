import Cookies from "js-cookie";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { getUserIdFromToken, login as apiLogin } from "../api/auth";
import { COOKIE_NAME } from "../api/client";

const SESSION_MS = 60 * 60 * 1000; // 1 hour
const COOKIE_DAYS = (SESSION_MS - 60000) / (1000 * 60 * 60 * 24); // 59 min as fraction of day

interface AuthContextValue {
  username: string | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(
    () => Cookies.get(COOKIE_NAME) ?? null,
  );
  const [username, setUsername] = useState<string | null>(() =>
    localStorage.getItem("username"),
  );
  const activityRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const credRef = useRef<{ username: string; password: string } | null>(null);

  const logout = useCallback(() => {
    Cookies.remove(COOKIE_NAME);
    localStorage.removeItem("username");
    setToken(null);
    setUsername(null);
    credRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const applyToken = useCallback((newToken: string, user: string) => {
    Cookies.set(COOKIE_NAME, newToken, { expires: COOKIE_DAYS });
    localStorage.setItem("username", user);
    setToken(newToken);
    setUsername(user);
  }, []);

  const startActivityTimer = useCallback(() => {
    if (timerRef.current) return;

    timerRef.current = setInterval(async () => {
      if (activityRef.current && credRef.current) {
        activityRef.current = false;
        try {
          const newToken = await apiLogin(
            credRef.current.username,
            credRef.current.password,
          );
          applyToken(newToken, getUserIdFromToken(newToken));
        } catch {
          logout();
        }
      } else {
        logout();
      }
    }, SESSION_MS);
  }, [applyToken, logout]);

  const login = useCallback(
    async (rawUsername: string, rawPassword: string) => {
      const newToken = await apiLogin(rawUsername, rawPassword);
      credRef.current = { username: rawUsername, password: rawPassword };
      applyToken(newToken, getUserIdFromToken(newToken));
      activityRef.current = false;
      startActivityTimer();
    },
    [applyToken, startActivityTimer],
  );

  // Track user activity
  useEffect(() => {
    const markActivity = () => {
      activityRef.current = true;
    };
    window.addEventListener("mousemove", markActivity);
    window.addEventListener("keydown", markActivity);
    return () => {
      window.removeEventListener("mousemove", markActivity);
      window.removeEventListener("keydown", markActivity);
    };
  }, []);

  // Resume session from cookie on page load
  useEffect(() => {
    const savedToken = Cookies.get(COOKIE_NAME);
    const savedUser = localStorage.getItem("username");
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUsername(savedUser);
      startActivityTimer();
    }
  }, [startActivityTimer]);

  return (
    <AuthContext.Provider
      value={{
        username,
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
