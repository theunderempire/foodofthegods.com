import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { COOKIE_NAME, client, unwrap } from "./client";
import type { ApiResponse } from "./client";

// `axios-mock-adapter` is not a dependency of this project, so instead of adding
// one we swap in `client.defaults.adapter`. That is axios' own extension point:
// requests still travel the full interceptor chain (request interceptor ->
// adapter -> response/error interceptor), we just terminate them in-process
// instead of over XHR. This exercises the interceptors as they actually run in
// the app rather than calling the handler functions in isolation.
const cookies = vi.hoisted(() => ({
  get: vi.fn<(name?: string) => string | undefined>(),
  set: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("js-cookie", () => ({ default: cookies }));

const realLocation = Object.getOwnPropertyDescriptor(window, "location")!;

/** Replace window.location so we can read back the redirect the 403 path performs. */
function stubLocation(pathname: string, search = "", hash = "") {
  const stub = {
    pathname,
    search,
    hash,
    protocol: "http:",
    host: "localhost:3000",
    origin: "http://localhost:3000",
    href: `http://localhost:3000${pathname}${search}${hash}`,
  };
  Object.defineProperty(window, "location", { configurable: true, value: stub });
  return stub;
}

let lastConfig: InternalAxiosRequestConfig | null = null;

function respondWith(body: unknown, status = 200) {
  client.defaults.adapter = async (config) => {
    lastConfig = config;
    return {
      data: body,
      status,
      statusText: "OK",
      headers: {},
      config,
    } as unknown as AxiosResponse;
  };
}

function failWith(error: Error) {
  client.defaults.adapter = async (config) => {
    lastConfig = config;
    throw error;
  };
}

function httpError(status: number, data?: unknown) {
  const err = new Error(`Request failed with status code ${status}`) as Error & {
    isAxiosError: boolean;
    response: unknown;
  };
  err.isAxiosError = true;
  err.response = { status, data, statusText: "", headers: {}, config: {} };
  return err;
}

/** Collect the payloads of every `api-error` event dispatched while a test runs. */
function captureApiErrors(): string[] {
  const seen: string[] = [];
  const handler = (e: Event) => seen.push((e as CustomEvent<string>).detail);
  window.addEventListener("api-error", handler);
  teardown.push(() => window.removeEventListener("api-error", handler));
  return seen;
}

let teardown: Array<() => void> = [];
const realAdapter = client.defaults.adapter;

beforeEach(() => {
  cookies.get.mockReset();
  cookies.set.mockReset();
  cookies.remove.mockReset();
  lastConfig = null;
  teardown = [];
  sessionStorage.clear();
  localStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  teardown.forEach((fn) => fn());
  Object.defineProperty(window, "location", realLocation);
  client.defaults.adapter = realAdapter;
  vi.restoreAllMocks();
});

describe("request interceptor", () => {
  test("attaches X-Access-Token when the auth cookie is present", async () => {
    cookies.get.mockReturnValue("token-abc");
    respondWith({ success: true, data: null });

    await client.get("/recipes");

    expect(cookies.get).toHaveBeenCalledWith(COOKIE_NAME);
    expect(lastConfig?.headers["X-Access-Token"]).toBe("token-abc");
  });

  test("omits X-Access-Token when there is no auth cookie", async () => {
    cookies.get.mockReturnValue(undefined);
    respondWith({ success: true, data: null });

    await client.get("/recipes");

    expect(lastConfig?.headers["X-Access-Token"]).toBeUndefined();
  });
});

describe("response interceptor", () => {
  test("rejects a 200 whose body reports success:false and surfaces the message", async () => {
    const errors = captureApiErrors();
    respondWith({ success: false, data: { message: "Recipe not found" } });

    await expect(client.get("/recipes/nope")).rejects.toThrow("Recipe not found");
    expect(errors).toEqual(["Recipe not found"]);
  });

  // The recipe, ingredient, and settings services send `data` as a bare string
  // rather than `{ message }`. Reading only `data.message` replaced every one of
  // those errors with the generic fallback.
  test("surfaces the message when success:false carries data as a plain string", async () => {
    const errors = captureApiErrors();
    respondWith({ success: false, data: "List is being grouped, try again in a moment." });

    await expect(client.get("/ingredientList/user-1/group")).rejects.toThrow(
      "List is being grouped, try again in a moment.",
    );
    expect(errors).toEqual(["List is being grouped, try again in a moment."]);
  });

  test("falls back to a generic message when success:false carries no message", async () => {
    const errors = captureApiErrors();
    respondWith({ success: false, data: {} });

    await expect(client.get("/recipes/nope")).rejects.toThrow("Request failed");
    expect(errors).toEqual(["Request failed"]);
  });

  test("falls back to a generic message when data is an empty string", async () => {
    const errors = captureApiErrors();
    respondWith({ success: false, data: "" });

    await expect(client.get("/recipes/nope")).rejects.toThrow("Request failed");
    expect(errors).toEqual(["Request failed"]);
  });

  test("passes a success:true response through unchanged", async () => {
    const errors = captureApiErrors();
    const body = { success: true, data: { id: "1", name: "Mole" } };
    respondWith(body);

    const res = await client.get("/recipes/1");

    expect(res.status).toBe(200);
    expect(res.data).toEqual(body);
    expect(errors).toEqual([]);
  });
});

describe("error interceptor", () => {
  test("a 403 clears the session, stores the return path and redirects to login", async () => {
    const errors = captureApiErrors();
    const location = stubLocation("/recipes/123", "?tab=notes");
    localStorage.setItem("username", "alice");
    const err = httpError(403, { success: false, data: { message: "Token expired" } });
    failWith(err);

    await expect(client.get("/recipes/123")).rejects.toBe(err);

    expect(cookies.remove).toHaveBeenCalledWith(COOKIE_NAME);
    expect(localStorage.getItem("username")).toBeNull();
    // toRouterPath strips the router basename; under test BASE_URL is "/" so the
    // window path and the router path coincide.
    expect(sessionStorage.getItem("fotg_return_to")).toBe("/recipes/123?tab=notes");
    expect(location.href).toBe(`${import.meta.env.BASE_URL}login`);
    // The 403 branch returns early: the user is being bounced to login, so no
    // toast should fire on top of the redirect.
    expect(errors).toEqual([]);
  });

  test("a 403 on the login page does not store an excluded return path", async () => {
    stubLocation("/login");
    const err = httpError(403, {});
    failWith(err);

    await expect(client.post("/token")).rejects.toBe(err);

    expect(sessionStorage.getItem("fotg_return_to")).toBeNull();
  });

  test("a non-403 error dispatches api-error with the server message and rejects", async () => {
    const errors = captureApiErrors();
    const err = httpError(500, { success: false, data: { message: "Database unavailable" } });
    failWith(err);

    await expect(client.get("/recipes")).rejects.toBe(err);

    expect(errors).toEqual(["Database unavailable"]);
    expect(cookies.remove).not.toHaveBeenCalled();
  });

  test("a non-403 error surfaces a string data payload too", async () => {
    const errors = captureApiErrors();
    const err = httpError(500, { success: false, data: "Too many requests." });
    failWith(err);

    await expect(client.get("/recipe/abc")).rejects.toBe(err);

    expect(errors).toEqual(["Too many requests."]);
  });

  test("a transport failure with no response falls back to the error message", async () => {
    const errors = captureApiErrors();
    const err = new Error("Network Error");
    failWith(err);

    await expect(client.get("/recipes")).rejects.toBe(err);

    expect(errors).toEqual(["Network Error"]);
  });
});

describe("unwrap", () => {
  test("returns the inner data payload", async () => {
    respondWith({ success: true, data: { id: "7", name: "Ambrosia" } });

    const result = await unwrap(
      client.get<ApiResponse<{ id: string; name: string }>>("/recipes/7"),
    );

    expect(result).toEqual({ id: "7", name: "Ambrosia" });
  });

  test("propagates the rejection produced by a success:false body", async () => {
    captureApiErrors();
    respondWith({ success: false, data: { message: "Nope" } });

    await expect(unwrap(client.get<ApiResponse<unknown>>("/recipes/7"))).rejects.toThrow("Nope");
  });
});
