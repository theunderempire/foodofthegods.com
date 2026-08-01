import { client, unwrap } from "./client";

async function sha256(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function decodeTokenPayload(token: string): Record<string, unknown> {
  const payload = token.split(".")[1];
  return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
}

export function getUserIdFromToken(token: string): string {
  return decodeTokenPayload(token).username as string;
}

// The auth cookie's lifetime is derived from this, so the cookie and the token
// expire together instead of drifting apart on two separate clocks.
export function getTokenExpiry(token: string): Date | null {
  const exp = decodeTokenPayload(token).exp;
  return typeof exp === "number" ? new Date(exp * 1000) : null;
}

// Exchanges the current token (attached by the client's request interceptor)
// for a fresh one. The API refuses once the session hits its absolute cap.
export async function refresh(): Promise<string> {
  const { token } = await unwrap<{ message: string; token: string }>(client.post("/token/refresh"));
  return token;
}

export async function login(rawUsername: string, rawPassword: string): Promise<string> {
  const { token } = await unwrap<{ message: string; token: string }>(
    client.post("/token", {
      username: await sha256(rawUsername),
      password: rawPassword,
    }),
  );
  return token;
}

export async function register(rawUsername: string, email: string): Promise<void> {
  await client.post("/mail", {
    username: await sha256(rawUsername),
    displayUsername: rawUsername,
    email,
  });
}

export async function setPassword(token: string, password: string): Promise<void> {
  await client.post("/mail/set-password", { token, password });
}
