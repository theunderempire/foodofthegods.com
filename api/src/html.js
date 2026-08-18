// Shared helpers for server-rendered HTML (approval emails, share previews).

// User-supplied values interpolated into server-rendered HTML must not be able
// to inject markup — e.g. a forged "Approve" link in a registration email, or a
// script tag in a share-preview page.
const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

// Absolute URL into the web app (Caddy-served SPA, including its sub-path).
export function appUrl(path) {
  const base = (process.env.APP_URL ?? "https://theunderempire.com/foodofthegods").replace(
    /\/$/,
    "",
  );
  return `${base}${path}`;
}

// Absolute URL into this API as reachable from the public internet.
export function apiUrl(path) {
  const base = (
    process.env.VITE_API_BASE_URL ?? "https://theunderempire.com/foodofthegods-api"
  ).replace(/\/$/, "");
  return `${base}${path}`;
}
