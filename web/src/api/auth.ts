import CryptoJS from "crypto-js";
import { client } from "./client";

function md5(value: string): string {
  return CryptoJS.MD5(value).toString();
}

function pbkdf2Hex(password: string, salt: string): string {
  return CryptoJS.PBKDF2(password, salt, {
    keySize: 8, // 8 words = 32 bytes
    iterations: 10,
    hasher: CryptoJS.algo.SHA512,
  }).toString();
}

export function hashPassword(timestamp: string, passwordMd5: string): string {
  const salt = md5(timestamp);
  const passHash = md5(passwordMd5);
  return salt + pbkdf2Hex(passHash, salt);
}

export function hashUsername(username: string): string {
  return md5(username);
}

interface TokenUsernameResponse {
  success: boolean;
  data: { username: string; timestamp: string };
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
  const usernameHash = md5(rawUsername);
  const passwordMd5 = md5(rawPassword);

  const usernameRes = await client.get<TokenUsernameResponse>(
    `/token/${usernameHash}`,
  );
  const { username, timestamp } = usernameRes.data.data;

  const hashedPassword = hashPassword(timestamp, passwordMd5);

  const tokenRes = await client.post<TokenPasswordResponse>("/token", {
    username,
    password: hashedPassword,
  });

  return tokenRes.data.data.token;
}

export interface RegistrationPayload {
  username: string;
  password: string;
  emailAddress: string;
  timestamp: string;
}

export async function register(
  rawUsername: string,
  rawPassword: string,
  email: string,
): Promise<void> {
  const usernameHash = md5(rawUsername);
  const passwordMd5 = md5(rawPassword);
  const timestamp = new Date().toString();
  const hashedPassword = hashPassword(timestamp, passwordMd5);

  await client.post("/mail", {
    username: usernameHash,
    password: hashedPassword,
    emailAddress: email,
    timestamp,
  });
}
