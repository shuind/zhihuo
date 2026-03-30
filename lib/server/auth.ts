import { createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";

const AUTH_COOKIE = "zhihuo_session";
const DEFAULT_AUTH_SECRET = "zhihuo_dev_only_change_me";
const SESSION_TTL_DAYS = 30;
let warnedDefaultSecret = false;

type SessionPayload = {
  uid: string;
  exp: number;
};

function getSecret() {
  const configured = process.env.AUTH_SECRET?.trim();
  if (configured) return configured;
  const isCi = process.env.CI === "true";
  if (process.env.NODE_ENV === "production" && !isCi) {
    throw new Error("AUTH_SECRET is required in production");
  }
  if (!warnedDefaultSecret) {
    warnedDefaultSecret = true;
    const reason = isCi ? "ci fallback" : "development fallback";
    console.warn(`[auth] AUTH_SECRET is not set, using ${reason} secret`);
  }
  return DEFAULT_AUTH_SECRET;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(payloadBase64: string) {
  return createHmac("sha256", getSecret()).update(payloadBase64).digest("base64url");
}

export function getAuthCookieName() {
  return AUTH_COOKIE;
}

export function createSessionToken(userId: string) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_DAYS * 24 * 60 * 60;
  const payload: SessionPayload = { uid: userId, exp };
  const payloadBase64 = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(payloadBase64);
  return `${payloadBase64}.${signature}`;
}

export function readSessionToken(token: string | undefined | null) {
  if (!token) return null;
  const [payloadBase64, signature] = token.split(".");
  if (!payloadBase64 || !signature) return null;
  const expected = sign(payloadBase64);
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (sigBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(sigBuffer, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(payloadBase64)) as SessionPayload;
    if (!payload || typeof payload.uid !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp * 1000 <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, encoded: string) {
  const [salt, expectedHash] = encoded.split(":");
  if (!salt || !expectedHash) return false;
  const actual = scryptSync(password, salt, 64).toString("hex");
  const expectedBuffer = Buffer.from(expectedHash, "hex");
  const actualBuffer = Buffer.from(actual, "hex");
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export function generateEmailVerificationCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashEmailVerificationCode(email: string, purpose: "register" | "reset_password", code: string) {
  return createHmac("sha256", getSecret()).update(`${purpose}:${email}:${code}`).digest("hex");
}

export function verifyEmailVerificationCode(
  email: string,
  purpose: "register" | "reset_password",
  code: string,
  expectedHash: string
) {
  const actual = hashEmailVerificationCode(email, purpose, code);
  const expectedBuffer = Buffer.from(expectedHash, "hex");
  const actualBuffer = Buffer.from(actual, "hex");
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}
