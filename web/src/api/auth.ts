import CryptoJS from "crypto-js";
import { client } from "./client";

function md5(value: string): string {
  return CryptoJS.MD5(value).toString();
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
    username: md5(rawUsername),
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
    username: md5(rawUsername),
    password: rawPassword,
    emailAddress: email,
  });
}
