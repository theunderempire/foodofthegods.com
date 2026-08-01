import { act, render, screen } from "@testing-library/react";

const SESSION_MS = 60 * 60 * 1000; // must match AuthContext
const COOKIE_NAME = "FOTG_AUTH_TOKEN";

// Stable mock objects created before the module graph loads, so they survive the
// vi.resetModules() calls used below to re-evaluate AuthContext under a
// different window.location.protocol.
const cookies = vi.hoisted(() => ({
  get: vi.fn<(name?: string) => string | undefined>(),
  set: vi.fn(),
  remove: vi.fn(),
}));
const authApi = vi.hoisted(() => ({
  login: vi.fn<(u: string, p: string) => Promise<string>>(),
  getUserIdFromToken: vi.fn<(t: string) => string>(),
}));

vi.mock("js-cookie", () => ({ default: cookies }));
vi.mock("../../api/auth", () => authApi);

interface AuthApi {
  username: string | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

// The provider's session logic is only observable through the context, so a
// probe component captures the live value for each test to drive and assert on.
let auth: AuthApi;

const realLocation = Object.getOwnPropertyDescriptor(window, "location")!;

// COOKIE_OPTIONS in AuthContext is computed once at module evaluation from
// window.location.protocol, so the protocol has to be in place *before* the
// module is imported. resetModules + dynamic import gives each test a provider
// built for the scheme it cares about.
async function renderAuth(protocol: "http:" | "https:" = "http:") {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { protocol, pathname: "/", search: "", hash: "", href: `${protocol}//localhost/` },
  });
  vi.resetModules();
  const { AuthProvider, useAuth } = await import("../AuthContext");

  function Probe() {
    auth = useAuth() as AuthApi;
    return (
      <div>
        <span data-testid="authenticated">{String(auth.isAuthenticated)}</span>
        <span data-testid="username">{auth.username ?? "-"}</span>
        <span data-testid="token">{auth.token ?? "-"}</span>
      </div>
    );
  }

  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

function state() {
  return {
    authenticated: screen.getByTestId("authenticated").textContent,
    username: screen.getByTestId("username").textContent,
    token: screen.getByTestId("token").textContent,
  };
}

async function doLogin(username = "alice", password = "hunter2") {
  await act(async () => {
    await auth.login(username, password);
  });
}

/** Run the hourly session tick, flushing the async silent re-login inside it. */
async function tick(ms = SESSION_MS) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function lastCookieOptions() {
  const calls = cookies.set.mock.calls;
  const call = calls[calls.length - 1];
  return call?.[2] as { expires: number; secure: boolean; sameSite: string };
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    cookies.get.mockReset().mockReturnValue(undefined);
    cookies.set.mockReset();
    cookies.remove.mockReset();
    authApi.login.mockReset().mockResolvedValue("token-1");
    authApi.getUserIdFromToken.mockReset().mockImplementation(() => "alice");
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window, "location", realLocation);
  });

  test("starts unauthenticated when there is no cookie", async () => {
    await renderAuth();
    expect(state()).toEqual({ authenticated: "false", username: "-", token: "-" });
  });

  describe("login", () => {
    test("stores the token in a cookie, the username in localStorage, and flips isAuthenticated", async () => {
      await renderAuth();
      await doLogin();

      expect(authApi.login).toHaveBeenCalledWith("alice", "hunter2");
      expect(cookies.set).toHaveBeenCalledWith(COOKIE_NAME, "token-1", expect.anything());
      expect(localStorage.getItem("username")).toBe("alice");
      expect(state()).toEqual({ authenticated: "true", username: "alice", token: "token-1" });
    });

    test("derives the stored username from the token rather than the typed input", async () => {
      authApi.getUserIdFromToken.mockReturnValue("hashed-user-id");
      await renderAuth();
      await doLogin("Alice", "hunter2");

      expect(authApi.getUserIdFromToken).toHaveBeenCalledWith("token-1");
      expect(localStorage.getItem("username")).toBe("hashed-user-id");
    });

    test("propagates a failed login without creating a session", async () => {
      authApi.login.mockRejectedValue(new Error("Invalid credentials"));
      await renderAuth();

      await expect(
        act(async () => {
          await auth.login("alice", "wrong");
        }),
      ).rejects.toThrow("Invalid credentials");

      expect(cookies.set).not.toHaveBeenCalled();
      expect(localStorage.getItem("username")).toBeNull();
      expect(state().authenticated).toBe("false");
    });
  });

  describe("cookie flags", () => {
    test("omits Secure over http so local dev can still set the cookie", async () => {
      await renderAuth("http:");
      await doLogin();
      expect(lastCookieOptions().secure).toBe(false);
    });

    test("sets Secure over https so the bearer token never crosses plaintext", async () => {
      await renderAuth("https:");
      await doLogin();
      expect(lastCookieOptions().secure).toBe(true);
    });

    test('uses sameSite "lax" and expires just under the session length', async () => {
      await renderAuth();
      await doLogin();

      const options = lastCookieOptions();
      expect(options.sameSite).toBe("lax");
      // 59 minutes expressed as a fraction of a day.
      expect(options.expires).toBeCloseTo(59 / (60 * 24), 10);
    });
  });

  describe("logout", () => {
    test("clears the cookie, localStorage and the context", async () => {
      await renderAuth();
      await doLogin();

      act(() => {
        auth.logout();
      });

      expect(cookies.remove).toHaveBeenCalledWith(COOKIE_NAME);
      expect(localStorage.getItem("username")).toBeNull();
      expect(state()).toEqual({ authenticated: "false", username: "-", token: "-" });
    });

    test("cancels the session timer so no further tick fires", async () => {
      await renderAuth();
      await doLogin();

      act(() => {
        auth.logout();
      });
      expect(cookies.remove).toHaveBeenCalledTimes(1);

      // With the interval still running this tick would log out again.
      window.dispatchEvent(new MouseEvent("mousemove"));
      await tick(SESSION_MS * 3);

      expect(cookies.remove).toHaveBeenCalledTimes(1);
      expect(authApi.login).toHaveBeenCalledTimes(1);
    });
  });

  describe("hourly session tick", () => {
    test("silently re-logs-in with cached credentials when activity was seen", async () => {
      await renderAuth();
      await doLogin();

      authApi.login.mockResolvedValue("token-2");
      authApi.getUserIdFromToken.mockReturnValue("alice");
      window.dispatchEvent(new MouseEvent("mousemove"));
      await tick();

      expect(authApi.login).toHaveBeenNthCalledWith(2, "alice", "hunter2");
      expect(cookies.set).toHaveBeenLastCalledWith(COOKIE_NAME, "token-2", expect.anything());
      expect(state()).toEqual({ authenticated: "true", username: "alice", token: "token-2" });
      expect(cookies.remove).not.toHaveBeenCalled();
    });

    test("counts a keydown as activity too", async () => {
      await renderAuth();
      await doLogin();

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
      await tick();

      expect(authApi.login).toHaveBeenCalledTimes(2);
      expect(state().authenticated).toBe("true");
    });

    test("logs the user out when the hour passed with no activity", async () => {
      await renderAuth();
      await doLogin();

      await tick();

      expect(authApi.login).toHaveBeenCalledTimes(1);
      expect(cookies.remove).toHaveBeenCalledWith(COOKIE_NAME);
      expect(localStorage.getItem("username")).toBeNull();
      expect(state().authenticated).toBe("false");
    });

    test("does not expire the session before the hour is up", async () => {
      await renderAuth();
      await doLogin();

      await tick(SESSION_MS - 1);

      expect(cookies.remove).not.toHaveBeenCalled();
      expect(state().authenticated).toBe("true");
    });

    test("requires fresh activity for each hour", async () => {
      await renderAuth();
      await doLogin();

      window.dispatchEvent(new MouseEvent("mousemove"));
      await tick();
      expect(state().authenticated).toBe("true");

      // No further activity: the flag was consumed by the previous tick.
      await tick();
      expect(state().authenticated).toBe("false");
    });

    test("logs the user out when the silent re-login fails", async () => {
      await renderAuth();
      await doLogin();

      authApi.login.mockRejectedValue(new Error("Token endpoint down"));
      window.dispatchEvent(new MouseEvent("mousemove"));
      await tick();

      expect(cookies.remove).toHaveBeenCalledWith(COOKIE_NAME);
      expect(state()).toEqual({ authenticated: "false", username: "-", token: "-" });
    });
  });

  describe("resume from cookie", () => {
    test("restores the session on mount when cookie and username are both present", async () => {
      cookies.get.mockReturnValue("saved-token");
      localStorage.setItem("username", "bob");

      await renderAuth();

      expect(state()).toEqual({ authenticated: "true", username: "bob", token: "saved-token" });
    });

    test("a restored session is still subject to the inactivity timeout", async () => {
      cookies.get.mockReturnValue("saved-token");
      localStorage.setItem("username", "bob");
      await renderAuth();

      await tick();

      expect(cookies.remove).toHaveBeenCalledWith(COOKIE_NAME);
      expect(state().authenticated).toBe("false");
    });

    test("a restored session cannot silently re-login, since credentials are not persisted", async () => {
      cookies.get.mockReturnValue("saved-token");
      localStorage.setItem("username", "bob");
      await renderAuth();

      window.dispatchEvent(new MouseEvent("mousemove"));
      await tick();

      expect(authApi.login).not.toHaveBeenCalled();
      expect(state().authenticated).toBe("false");
    });
  });
});
