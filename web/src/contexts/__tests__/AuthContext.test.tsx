import { act, render, screen } from "@testing-library/react";

const TOKEN_TTL_MS = 60 * 60 * 1000; // must match the API's access token TTL
const REFRESH_THROTTLE_MS = 5 * 60 * 1000; // must match AuthContext
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
  refresh: vi.fn<() => Promise<string>>(),
  getUserIdFromToken: vi.fn<(t: string) => string>(),
  getTokenExpiry: vi.fn<(t: string) => Date | null>(),
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

  const result = render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  // Flush the resume-from-cookie refresh that fires on mount.
  await act(async () => {});
  return result;
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

/** Advance the fake clock, flushing any async refresh/expiry work it triggers. */
async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Simulate user activity, flushing the refresh it may kick off. */
async function activity(event: Event = new MouseEvent("mousemove")) {
  await act(async () => {
    window.dispatchEvent(event);
  });
}

function lastCookieOptions() {
  const calls = cookies.set.mock.calls;
  const call = calls[calls.length - 1];
  return call?.[2] as { expires?: Date; secure: boolean; sameSite: string };
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    cookies.get.mockReset().mockReturnValue(undefined);
    cookies.set.mockReset();
    cookies.remove.mockReset();
    authApi.login.mockReset().mockResolvedValue("token-1");
    authApi.refresh.mockReset().mockResolvedValue("token-2");
    authApi.getUserIdFromToken.mockReset().mockImplementation(() => "alice");
    // Tokens in these tests behave like the API's: they expire one TTL after
    // they were minted (i.e. after the moment the mock resolves them).
    authApi.getTokenExpiry
      .mockReset()
      .mockImplementation(() => new Date(Date.now() + TOKEN_TTL_MS));
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window, "location", realLocation);
  });

  test("starts unauthenticated when there is no cookie", async () => {
    await renderAuth();
    expect(state()).toEqual({ authenticated: "false", username: "-", token: "-" });
    expect(authApi.refresh).not.toHaveBeenCalled();
  });

  describe("login", () => {
    test("stores the token in a cookie and flips isAuthenticated", async () => {
      await renderAuth();
      await doLogin();

      expect(authApi.login).toHaveBeenCalledWith("alice", "hunter2");
      expect(cookies.set).toHaveBeenCalledWith(COOKIE_NAME, "token-1", expect.anything());
      expect(state()).toEqual({ authenticated: "true", username: "alice", token: "token-1" });
    });

    test("derives the username from the token, with no copy in localStorage", async () => {
      authApi.getUserIdFromToken.mockReturnValue("hashed-user-id");
      await renderAuth();
      await doLogin("Alice", "hunter2");

      expect(authApi.getUserIdFromToken).toHaveBeenCalledWith("token-1");
      expect(state().username).toBe("hashed-user-id");
      expect(localStorage.getItem("username")).toBeNull();
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
      expect(state().authenticated).toBe("false");
    });

    test("retains no credentials: renewal goes through refresh, never a replayed login", async () => {
      await renderAuth();
      await doLogin();

      await tick(REFRESH_THROTTLE_MS);
      await activity();

      expect(authApi.refresh).toHaveBeenCalledTimes(1);
      expect(authApi.login).toHaveBeenCalledTimes(1);
      expect(authApi.login).not.toHaveBeenCalledWith("alice", "hunter2", expect.anything());
      expect(state()).toEqual({ authenticated: "true", username: "alice", token: "token-2" });
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

    test('uses sameSite "lax" and expires exactly when the token does', async () => {
      await renderAuth();
      await doLogin();

      const options = lastCookieOptions();
      expect(options.sameSite).toBe("lax");
      expect(authApi.getTokenExpiry).toHaveBeenCalledWith("token-1");
      expect(options.expires).toEqual(new Date(Date.now() + TOKEN_TTL_MS));
    });

    test("falls back to a session cookie for a token without an exp claim", async () => {
      authApi.getTokenExpiry.mockReturnValue(null);
      await renderAuth();
      await doLogin();

      expect(lastCookieOptions().expires).toBeUndefined();
    });
  });

  describe("logout", () => {
    test("clears the cookie and the context", async () => {
      await renderAuth();
      await doLogin();

      act(() => {
        auth.logout();
      });

      expect(cookies.remove).toHaveBeenCalledWith(COOKIE_NAME);
      expect(state()).toEqual({ authenticated: "false", username: "-", token: "-" });
    });

    test("cancels the expiry timer so no further logout fires", async () => {
      await renderAuth();
      await doLogin();

      act(() => {
        auth.logout();
      });
      expect(cookies.remove).toHaveBeenCalledTimes(1);

      // With the timer still armed this would log out (and remove) again.
      await tick(TOKEN_TTL_MS * 3);

      expect(cookies.remove).toHaveBeenCalledTimes(1);
    });
  });

  describe("sliding refresh", () => {
    test("activity refreshes the token at most once per throttle window", async () => {
      await renderAuth();
      await doLogin();

      await tick(REFRESH_THROTTLE_MS);
      await activity();
      await activity();
      await activity();

      expect(authApi.refresh).toHaveBeenCalledTimes(1);
      expect(cookies.set).toHaveBeenLastCalledWith(COOKIE_NAME, "token-2", expect.anything());
      expect(state()).toEqual({ authenticated: "true", username: "alice", token: "token-2" });
    });

    test("counts a keydown as activity too", async () => {
      await renderAuth();
      await doLogin();

      await tick(REFRESH_THROTTLE_MS);
      await activity(new KeyboardEvent("keydown", { key: "a" }));

      expect(authApi.refresh).toHaveBeenCalledTimes(1);
    });

    test("does not refresh before the throttle window has passed", async () => {
      await renderAuth();
      await doLogin();

      await tick(REFRESH_THROTTLE_MS - 1000);
      await activity();

      expect(authApi.refresh).not.toHaveBeenCalled();
      expect(state().authenticated).toBe("true");
    });

    test("ignores activity when logged out", async () => {
      await renderAuth();

      await tick(REFRESH_THROTTLE_MS * 2);
      await activity();

      expect(authApi.refresh).not.toHaveBeenCalled();
    });

    test("logs the user out when the token expires with no activity", async () => {
      await renderAuth();
      await doLogin();

      await tick(TOKEN_TTL_MS);

      expect(authApi.refresh).not.toHaveBeenCalled();
      expect(cookies.remove).toHaveBeenCalledWith(COOKIE_NAME);
      expect(state()).toEqual({ authenticated: "false", username: "-", token: "-" });
    });

    test("does not expire the session before the token's lifetime is up", async () => {
      await renderAuth();
      await doLogin();

      await tick(TOKEN_TTL_MS - 1000);

      expect(cookies.remove).not.toHaveBeenCalled();
      expect(state().authenticated).toBe("true");
    });

    test("an active user slides indefinitely, well past a single token lifetime", async () => {
      await renderAuth();
      await doLogin();

      // Three token lifetimes of steady activity, one refresh per window.
      const windows = (TOKEN_TTL_MS * 3) / REFRESH_THROTTLE_MS;
      for (let i = 0; i < windows; i++) {
        await tick(REFRESH_THROTTLE_MS);
        await activity();
      }

      expect(authApi.refresh).toHaveBeenCalledTimes(windows);
      expect(cookies.remove).not.toHaveBeenCalled();
      expect(state().authenticated).toBe("true");
    });

    test("logs the user out when the refresh fails", async () => {
      await renderAuth();
      await doLogin();

      authApi.refresh.mockRejectedValue(new Error("Session expired"));
      await tick(REFRESH_THROTTLE_MS);
      await activity();

      expect(cookies.remove).toHaveBeenCalledWith(COOKIE_NAME);
      expect(state()).toEqual({ authenticated: "false", username: "-", token: "-" });
    });
  });

  describe("resume from cookie", () => {
    test("a reload refreshes the saved token and continues the session", async () => {
      cookies.get.mockReturnValue("saved-token");

      await renderAuth();

      expect(authApi.refresh).toHaveBeenCalledTimes(1);
      expect(authApi.login).not.toHaveBeenCalled();
      expect(state()).toEqual({ authenticated: "true", username: "alice", token: "token-2" });
    });

    test("the cookie alone restores the session — localStorage is not consulted", async () => {
      cookies.get.mockReturnValue("saved-token");
      expect(localStorage.getItem("username")).toBeNull();

      await renderAuth();

      expect(state().authenticated).toBe("true");
      expect(state().username).toBe("alice");
    });

    test("a restored session slides on activity just like a fresh one", async () => {
      cookies.get.mockReturnValue("saved-token");
      await renderAuth();

      await tick(REFRESH_THROTTLE_MS);
      await activity();

      expect(authApi.refresh).toHaveBeenCalledTimes(2);
      expect(state().authenticated).toBe("true");
    });

    test("a restored session is still subject to the inactivity timeout", async () => {
      cookies.get.mockReturnValue("saved-token");
      await renderAuth();

      await tick(TOKEN_TTL_MS);

      expect(cookies.remove).toHaveBeenCalledWith(COOKIE_NAME);
      expect(state().authenticated).toBe("false");
    });

    test("a saved token the API refuses to refresh is logged out", async () => {
      cookies.get.mockReturnValue("saved-token");
      authApi.refresh.mockRejectedValue(new Error("Session expired"));

      await renderAuth();

      expect(cookies.remove).toHaveBeenCalledWith(COOKIE_NAME);
      expect(state()).toEqual({ authenticated: "false", username: "-", token: "-" });
    });
  });
});
