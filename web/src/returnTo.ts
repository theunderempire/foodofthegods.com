// Deeplink "return to" handling: remembers where the user was headed when they
// got bounced to /login (either by ProtectedRoute or by a 403 hard-redirect in
// the api client), so we can send them back there after they sign in again.

const KEY = "fotg_return_to";

// Default landing spot when there's nothing to resume.
export const DEFAULT_REDIRECT = "/recipes";

// Never resume onto auth pages — that would loop the user back to login.
const EXCLUDED = ["/login", "/register"];

function isExcluded(path: string): boolean {
  return EXCLUDED.some((p) => path === p || path.startsWith(`${p}?`) || path.startsWith(`${p}/`));
}

// Store a router-relative path (e.g. "/recipes/123?foo=bar") to resume later.
export function setReturnTo(path: string): void {
  if (!path || isExcluded(path)) return;
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    /* sessionStorage unavailable (private mode / quota) — fall back to default */
  }
}

// Read and clear the stored path, falling back to DEFAULT_REDIRECT.
export function consumeReturnTo(): string {
  try {
    const path = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (path && !isExcluded(path)) return path;
  } catch {
    /* ignore */
  }
  return DEFAULT_REDIRECT;
}

// Strip the router basename off an absolute window path so it can be fed to
// React Router. Used by the api client, which only sees window.location.
export function toRouterPath(pathname: string, search = "", hash = ""): string {
  const base = import.meta.env.BASE_URL || "/";
  let path = pathname;
  if (base !== "/" && path.startsWith(base)) {
    path = `/${path.slice(base.length)}`;
  }
  path = path.replace(/\/{2,}/g, "/");
  return path + search + hash;
}
