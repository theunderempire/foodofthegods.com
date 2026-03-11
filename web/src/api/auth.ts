import { client } from "./client";

async function sha256(value: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface TokenPasswordResponse {
  success: boolean;
  data: { message: string; token: string };
}

export function getUserIdFromToken(token: string): string {
  const payload = token.split(".")[1];
  const decoded = JSON.parse(
    atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
  );
  return decoded.username;
}

export async function login(
  rawUsername: string,
  rawPassword: string,
): Promise<string> {
  const tokenRes = await client.post<TokenPasswordResponse>("/token", {
    username: await sha256(rawUsername),
    password: rawPassword,
  });
  return tokenRes.data.data.token;
}

export async function register(
  rawUsername: string,
  rawPassword: string,
  email: string,
): Promise<void> {
  await client.post("/mail", {
    username: await sha256(rawUsername),
    password: rawPassword,
    emailAddress: email,
  });
}
