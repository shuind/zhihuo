"use client";

import NextImage from "next/image";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { verifyPin } from "@/components/offline-store";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
export function PinGate(props: { lockedUntil: number; onVerified: () => void }) {
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (props.lockedUntil <= Date.now()) return;
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [props.lockedUntil]);

  void tick;

  const lockedSeconds = Math.max(0, Math.ceil((props.lockedUntil - Date.now()) / 1000));

  const submit = useCallback(() => {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    void (async () => {
      try {
        const result = await verifyPin(pin);
        if (!result.ok) {
          setError(result.error ?? "PIN 校验失败");
          return;
        }
        setPin("");
        props.onVerified();
      } finally {
        setSubmitting(false);
      }
    })();
  }, [pin, props, submitting]);

  return (
    <div className="grid h-screen place-items-center bg-slate-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-300/15 bg-slate-900/70 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
        <p className="text-sm tracking-[0.22em] text-slate-300/85">本地锁屏</p>
        <p className="mt-2 text-xs text-slate-400/75">请输入 PIN 以解锁离线内容。</p>
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D+/g, "").slice(0, 12))}
          placeholder="PIN"
          className="mt-4 h-10 w-full rounded-lg border border-slate-300/20 bg-slate-950/60 px-3 text-sm text-slate-100 outline-none focus-visible:ring-1 focus-visible:ring-slate-300/45"
          onKeyDown={(event) => event.key === "Enter" && submit()}
          disabled={lockedSeconds > 0}
        />
        <Button
          type="button"
          disabled={submitting || lockedSeconds > 0}
          className="mt-4 w-full rounded-full border border-slate-300/30 bg-slate-900/70 text-slate-100 hover:bg-slate-800/90"
          onClick={submit}
        >
          {lockedSeconds > 0 ? `请等待 ${lockedSeconds}s` : submitting ? "解锁中..." : "解锁"}
        </Button>
        <p className={cn("mt-3 min-h-[1.2em] text-xs text-red-300/85", error ? "opacity-100" : "opacity-0")}>{error}</p>
      </div>
    </div>
  );
}

export function AuthDialog(props: { onClose: () => void; onAuthed: () => void }) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md">
        <AuthPanel onAuthed={props.onAuthed} onClose={props.onClose} />
      </div>
    </div>
  );
}

export function BindingDialog(props: { submitting: boolean; onUploadLocal: () => void; onKeepCloud: () => void }) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-slate-200/15 bg-slate-950/95 p-6 text-slate-100 shadow-[0_30px_90px_rgba(0,0,0,0.5)]">
        <p className="text-sm tracking-[0.18em] text-slate-300/85">首次绑定账号</p>
        <h2 className="mt-3 text-xl font-medium">云端已存在数据</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300/80">
          当前设备里也有本地离线数据。为了避免误合并，这次需要明确选择保留哪一边。
        </p>
        <div className="mt-6 grid gap-3">
          <Button
            type="button"
            disabled={props.submitting}
            className="rounded-full border border-slate-200/25 bg-slate-100 text-slate-950 hover:bg-white"
            onClick={props.onUploadLocal}
          >
            {props.submitting ? "处理中..." : "上传本地覆盖云端"}
          </Button>
          <Button
            type="button"
            disabled={props.submitting}
            variant="ghost"
            className="rounded-full border border-slate-300/20 bg-slate-900/60 text-slate-100 hover:bg-slate-800/80"
            onClick={props.onKeepCloud}
          >
            保留云端丢弃本地
          </Button>
        </div>
      </div>
    </div>
  );
}

const REGISTER_CODE_BYPASS_ENABLED = process.env.NODE_ENV !== "production";

export function AuthPanel(props: { onAuthed: () => void; onClose?: () => void }) {
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownTick, setCooldownTick] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!cooldownUntil) return;
    const timer = window.setInterval(() => {
      if (Date.now() >= cooldownUntil) {
        setCooldownUntil(0);
        setCooldownTick(0);
        window.clearInterval(timer);
        return;
      }
      setCooldownTick((value) => value + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  const switchMode = useCallback((nextMode: "login" | "register" | "forgot") => {
    setMode(nextMode);
    setCode("");
    setPassword("");
    setConfirmPassword("");
    setError("");
    setCooldownUntil(0);
    setCooldownTick(0);
  }, []);

  void cooldownTick;
  const resendSeconds = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));

  const submit = useCallback(() => {
    if (mode === "login") {
      if (!email.trim() || !password) {
        setError("请输入邮箱和密码");
        return;
      }
    } else {
      const needsCode = mode === "forgot" || !REGISTER_CODE_BYPASS_ENABLED;
      if (!email.trim() || !password || !confirmPassword || (needsCode && !code.trim())) {
        setError(
          mode === "register" && REGISTER_CODE_BYPASS_ENABLED
            ? "请输入邮箱、密码和重复密码"
            : mode === "register"
              ? "请输入邮箱、密码、重复密码和验证码"
              : "请输入邮箱、新密码、重复密码和验证码"
        );
        return;
      }
      if (password !== confirmPassword) {
        setError("两次输入的密码不一致");
        return;
      }
    }

    setSubmitting(true);
    setError("");
    void (async () => {
      try {
        const endpoint =
          mode === "login" ? "/v1/auth/login" : mode === "register" ? "/v1/auth/register" : "/v1/auth/password/reset";
        const body =
          mode === "login"
            ? { email, password }
            : mode === "register"
              ? { email, password, code: REGISTER_CODE_BYPASS_ENABLED ? "" : code }
              : { email, code, newPassword: password };
        const response = await apiFetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          setError(payload.error || "认证失败");
          return;
        }
        if (mode === "forgot") {
          setError("");
          setCode("");
          setPassword("");
          setConfirmPassword("");
          setCooldownUntil(0);
          setCooldownTick(0);
          setMode("login");
          return;
        }
        props.onAuthed();
        props.onClose?.();
      } catch {
        setError("网络异常，请稍后再试");
      } finally {
        setSubmitting(false);
      }
    })();
  }, [code, confirmPassword, email, mode, password, props]);

  const sendCode = useCallback(() => {
    if (!email.trim()) {
      setError("请先输入邮箱");
      return;
    }
    setSendingCode(true);
    setError("");
    void (async () => {
      try {
        const endpoint = mode === "forgot" ? "/v1/auth/password/send-reset-code" : "/v1/auth/register/send-code";
        const response = await apiFetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email })
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          setError(payload.error || "验证码发送失败");
          return;
        }
        setCooldownUntil(Date.now() + 60_000);
      } catch {
        setError("网络异常，请稍后再试");
      } finally {
        setSendingCode(false);
      }
    })();
  }, [email, mode]);

  return (
    <div className={cn("px-4", props.onClose ? "" : "grid h-screen place-items-center bg-slate-950")}>
      <div className="w-full max-w-md rounded-2xl border border-slate-300/15 bg-slate-900/65 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
        <div className="flex items-start justify-between gap-3">
          <p className="inline-flex items-center gap-2 text-sm tracking-[0.22em] text-slate-300/85"><NextImage src="/zhihuo_logo_icon.svg" alt="Zhihuo logo" width={16} height={16} className="h-4 w-4 rounded-sm object-contain opacity-90" /><span>知惑 Zhihuo</span></p>
          {props.onClose ? (
            <button
              type="button"
              className="rounded-full border border-slate-300/20 px-2.5 py-1 text-xs text-slate-300/75 transition-colors hover:bg-slate-800/70"
              onClick={props.onClose}
            >
              关闭
            </button>
          ) : null}
        </div>
        <p className="mt-2 text-xs tracking-[0.12em] text-slate-400/75">
          {mode === "login"
            ? "请先登录你的时间档案馆"
            : mode === "register"
              ? REGISTER_CODE_BYPASS_ENABLED
                ? "本地开发环境可直接注册"
                : "用邮箱验证码完成注册"
              : "用邮箱验证码重置密码"}
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              mode === "login" ? "border-slate-300/45 bg-slate-900 text-slate-100" : "border-slate-300/20 text-slate-300/75"
            )}
            onClick={() => switchMode("login")}
          >
            登录
          </button>
          <button
            type="button"
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              mode === "register" ? "border-slate-300/45 bg-slate-900 text-slate-100" : "border-slate-300/20 text-slate-300/75"
            )}
            onClick={() => switchMode("register")}
          >
            注册
          </button>
          <button
            type="button"
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              mode === "forgot" ? "border-slate-300/45 bg-slate-900 text-slate-100" : "border-slate-300/20 text-slate-300/75"
            )}
            onClick={() => switchMode("forgot")}
          >
            忘记密码
          </button>
        </div>
        <div className="mt-4 grid gap-3">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="邮箱"
            className="h-10 rounded-lg border border-slate-300/20 bg-slate-950/60 px-3 text-sm text-slate-100 outline-none focus-visible:ring-1 focus-visible:ring-slate-300/45"
          />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={mode === "forgot" ? "新密码（至少8位）" : "密码（至少8位）"}
            className="h-10 rounded-lg border border-slate-300/20 bg-slate-950/60 px-3 text-sm text-slate-100 outline-none focus-visible:ring-1 focus-visible:ring-slate-300/45"
            onKeyDown={(event) => event.key === "Enter" && submit()}
          />
          {mode !== "login" ? (
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder={mode === "register" ? "重复输入密码" : "重复输入新密码"}
              className="h-10 rounded-lg border border-slate-300/20 bg-slate-950/60 px-3 text-sm text-slate-100 outline-none focus-visible:ring-1 focus-visible:ring-slate-300/45"
              onKeyDown={(event) => event.key === "Enter" && submit()}
            />
          ) : null}
          {mode !== "login" && !(mode === "register" && REGISTER_CODE_BYPASS_ENABLED) ? (
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D+/g, "").slice(0, 6))}
                placeholder="邮箱验证码"
                className="h-10 flex-1 rounded-lg border border-slate-300/20 bg-slate-950/60 px-3 text-sm text-slate-100 outline-none focus-visible:ring-1 focus-visible:ring-slate-300/45"
                onKeyDown={(event) => event.key === "Enter" && submit()}
              />
              <Button
                type="button"
                disabled={sendingCode || resendSeconds > 0}
                className="rounded-full border border-slate-300/20 bg-slate-950/40 px-4 text-xs text-slate-200 hover:bg-slate-900/70 disabled:text-slate-500"
                onClick={sendCode}
              >
                {sendingCode ? "发送中..." : resendSeconds > 0 ? `${resendSeconds}s` : "发送验证码"}
              </Button>
            </div>
          ) : null}
          <Button
            type="button"
            disabled={submitting}
            className="rounded-full border border-slate-300/30 bg-slate-900/70 text-slate-100 hover:bg-slate-800/90"
            onClick={submit}
          >
            {submitting ? "处理中..." : mode === "login" ? "登录" : mode === "register" ? "注册并登录" : "重置密码"}
          </Button>
          {mode === "login" ? (
            <button
              type="button"
              className="justify-self-start text-xs text-slate-400/75 transition-colors hover:text-slate-200/85"
              onClick={() => switchMode("forgot")}
            >
              忘记密码？
            </button>
          ) : null}
          <p className={cn("min-h-[1.2em] text-xs text-red-300/85", error ? "opacity-100" : "opacity-0")}>{error}</p>
        </div>
      </div>
    </div>
  );
}
