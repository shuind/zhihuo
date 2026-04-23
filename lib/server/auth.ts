import { createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { NextRequest } from "next/server";

import { isAllowedCrossOriginRequest } from "@/lib/server/cors";

const AUTH_COOKIE = "zhihuo_session";
const DEFAULT_AUTH_SECRET = "zhihuo_dev_only_change_me";
const SESSION_TTL_DAYS = 30;
let warnedDefaultSecret = false;
let warnedPersistedSecretFallback = false;
let warnedGeneratedSecretFallback = false;
let warnedPersistFailure = false;
let cachedSecretState: AuthSecretState | null = null;

type SessionPayload = {
  uid: string;
  exp: number;
};

type PersistedAuthSecretStore = {
  active: string;
  previous?: string[];
  updated_at?: string;
};

type AuthSecretState = {
  active: string;
  previous: string[];
  source: "env" | "runtime_file" | "generated" | "development_fallback" | "ci_fallback";
};

function runtimeDataDir() {
  const configured = process.env.RUNTIME_DATA_DIR?.trim();
  if (configured) return configured;
  return path.join(process.cwd(), "runtime-data");
}

function secretStorePath() {
  return path.join(runtimeDataDir(), "auth-secret.json");
}

function uniqueSecrets(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function previousSecretsFromEnv() {
  return uniqueSecrets((process.env.AUTH_SECRET_PREVIOUS ?? "").split(","));
}

function readPersistedSecretStore(): PersistedAuthSecretStore | null {
  try {
    const raw = readFileSync(secretStorePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<PersistedAuthSecretStore>;
    if (!parsed || typeof parsed.active !== "string" || !parsed.active.trim()) return null;
    return {
      active: parsed.active.trim(),
      previous: Array.isArray(parsed.previous) ? uniqueSecrets(parsed.previous.filter((value) => typeof value === "string")) : [],
      updated_at: typeof parsed.updated_at === "string" ? parsed.updated_at : undefined
    };
  } catch {
    return null;
  }
}

function persistSecretStore(store: PersistedAuthSecretStore) {
  try {
    mkdirSync(runtimeDataDir(), { recursive: true });
    writeFileSync(
      secretStorePath(),
      JSON.stringify(
        {
          active: store.active,
          previous: uniqueSecrets(store.previous ?? []),
          updated_at: store.updated_at ?? new Date().toISOString()
        },
        null,
        2
      ),
      "utf8"
    );
  } catch (error) {
    if (!warnedPersistFailure) {
      warnedPersistFailure = true;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[auth] failed to persist runtime secret store: ${message}`);
    }
  }
}

function buildSecretState(): AuthSecretState {
  const configured = process.env.AUTH_SECRET?.trim();
  const previousFromEnv = previousSecretsFromEnv();
  const persisted = readPersistedSecretStore();

  if (configured) {
    const previous = uniqueSecrets([persisted?.active, ...(persisted?.previous ?? []), ...previousFromEnv]).filter(
      (secret) => secret !== configured
    );
    const shouldPersist =
      !persisted ||
      persisted.active !== configured ||
      previous.length !== (persisted.previous?.length ?? 0) ||
      previous.some((secret, index) => secret !== persisted.previous?.[index]);
    if (shouldPersist) {
      persistSecretStore({
        active: configured,
        previous,
        updated_at: new Date().toISOString()
      });
    }
    return { active: configured, previous, source: "env" };
  }

  const isCi = process.env.CI === "true";
  if (process.env.NODE_ENV === "production" && !isCi) {
    if (persisted?.active) {
      if (!warnedPersistedSecretFallback) {
        warnedPersistedSecretFallback = true;
        console.warn("[auth] AUTH_SECRET is missing in production, falling back to persisted runtime secret");
      }
      return {
        active: persisted.active,
        previous: uniqueSecrets([...(persisted.previous ?? []), ...previousFromEnv]).filter(
          (secret) => secret !== persisted.active
        ),
        source: "runtime_file"
      };
    }

    const generated = randomBytes(32).toString("hex");
    persistSecretStore({
      active: generated,
      previous: previousFromEnv,
      updated_at: new Date().toISOString()
    });
    if (!warnedGeneratedSecretFallback) {
      warnedGeneratedSecretFallback = true;
      console.warn("[auth] AUTH_SECRET is missing in production, generated and persisted a new runtime secret");
    }
    return { active: generated, previous: previousFromEnv, source: "generated" };
  }

  if (!warnedDefaultSecret) {
    warnedDefaultSecret = true;
    const reason = isCi ? "ci fallback" : "development fallback";
    console.warn(`[auth] AUTH_SECRET is not set, using ${reason} secret`);
  }
  return {
    active: DEFAULT_AUTH_SECRET,
    previous: previousFromEnv,
    source: isCi ? "ci_fallback" : "development_fallback"
  };
}

function getSecretState() {
  if (!cachedSecretState) {
    cachedSecretState = buildSecretState();
  }
  return cachedSecretState;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signWithSecret(payloadBase64: string, secret: string) {
  return createHmac("sha256", secret).update(payloadBase64).digest("base64url");
}

function sign(payloadBase64: string) {
  return signWithSecret(payloadBase64, getSecretState().active);
}

export function getAuthCookieName() {
  return AUTH_COOKIE;
}

export function getAuthCookieOptions(request: NextRequest, maxAge: number) {
  const crossOrigin = isAllowedCrossOriginRequest(request);
  return {
    httpOnly: true,
    sameSite: crossOrigin ? ("none" as const) : ("lax" as const),
    secure: crossOrigin ? true : process.env.NODE_ENV === "production",
    path: "/",
    maxAge
  };
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

  const sigBuffer = Buffer.from(signature);
  const verificationSecrets = uniqueSecrets([getSecretState().active, ...getSecretState().previous]);
  const matched = verificationSecrets.some((secret) => {
    const expectedBuffer = Buffer.from(signWithSecret(payloadBase64, secret));
    return sigBuffer.length === expectedBuffer.length && timingSafeEqual(sigBuffer, expectedBuffer);
  });
  if (!matched) return null;

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
  return createHmac("sha256", getSecretState().active).update(`${purpose}:${email}:${code}`).digest("hex");
}

export function verifyEmailVerificationCode(
  email: string,
  purpose: "register" | "reset_password",
  code: string,
  expectedHash: string
) {
  const expectedBuffer = Buffer.from(expectedHash, "hex");
  const verificationSecrets = uniqueSecrets([getSecretState().active, ...getSecretState().previous]);
  return verificationSecrets.some((secret) => {
    const actual = createHmac("sha256", secret).update(`${purpose}:${email}:${code}`).digest("hex");
    const actualBuffer = Buffer.from(actual, "hex");
    return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
  });
}

export function getAuthSecretStatus() {
  const state = getSecretState();
  return {
    source: state.source,
    runtime_store_path: secretStorePath(),
    runtime_store_exists: existsSync(secretStorePath()),
    previous_secret_count: state.previous.length
  };
}
