"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";

import {
  changePin,
  clearLastUserMarker,
  clearPinStatus,
  disablePin,
  enablePin,
  getPinStatus
} from "@/components/offline-store";

export type SessionUser = {
  userId: string;
  email: string;
};

type UseAuthGateOptions = {
  showNotice: (message: string, duration?: number) => void;
  onUnauthorized?: () => void;
};

type PinOperationResult = Awaited<ReturnType<typeof enablePin>>;

export type AuthGate = {
  authReady: boolean;
  setAuthReady: Dispatch<SetStateAction<boolean>>;
  sessionUser: SessionUser | null;
  setSessionUser: Dispatch<SetStateAction<SessionUser | null>>;
  cloudSessionEnabled: boolean;
  setCloudSessionEnabled: Dispatch<SetStateAction<boolean>>;
  pinReady: boolean;
  pinEnabled: boolean;
  pinLockedUntil: number;
  pinUnlocked: boolean;
  authDialogOpen: boolean;
  handleUnauthorized: (response: Response) => boolean;
  handlePinVerified: () => void;
  handleEnablePin: (pin: string) => Promise<PinOperationResult>;
  handleDisablePin: (pin: string) => Promise<PinOperationResult>;
  handleChangePin: (currentPin: string, nextPin: string) => Promise<PinOperationResult>;
  resetPinAfterForgot: () => void;
  openAuthDialog: () => void;
  closeAuthDialog: () => void;
};

export function useAuthGate({ showNotice, onUnauthorized }: UseAuthGateOptions): AuthGate {
  const [authReady, setAuthReady] = useState(false);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [cloudSessionEnabled, setCloudSessionEnabled] = useState(true);
  const [pinReady, setPinReady] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [pinLockedUntil, setPinLockedUntil] = useState(0);
  const [pinUnlocked, setPinUnlocked] = useState(false);
  const [pinTick, setPinTick] = useState(0);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);

  const refreshPinState = useCallback(() => {
    const status = getPinStatus();
    setPinEnabled(status.enabled);
    setPinLockedUntil(status.lockedUntil);
    return status;
  }, []);

  const handleUnauthorized = useCallback(
    (response: Response) => {
      if (response.status !== 401) return false;
      clearLastUserMarker();
      setSessionUser(null);
      setAuthReady(true);
      onUnauthorized?.();
      if (sessionUser) showNotice("登录已失效，请重新登录");
      return true;
    },
    [onUnauthorized, sessionUser, showNotice]
  );

  const handlePinVerified = useCallback(() => {
    setPinUnlocked(true);
    const status = refreshPinState();
    if (!status.enabled) setPinEnabled(false);
  }, [refreshPinState]);

  const handleEnablePin = useCallback(
    async (pin: string) => {
      const result = await enablePin(pin);
      refreshPinState();
      return result;
    },
    [refreshPinState]
  );

  const handleDisablePin = useCallback(
    async (pin: string) => {
      const result = await disablePin(pin);
      refreshPinState();
      if (result.ok) setPinUnlocked(true);
      return result;
    },
    [refreshPinState]
  );

  const handleChangePin = useCallback(
    async (currentPin: string, nextPin: string) => {
      const result = await changePin(currentPin, nextPin);
      refreshPinState();
      return result;
    },
    [refreshPinState]
  );

  const resetPinAfterForgot = useCallback(() => {
    clearPinStatus();
    setPinUnlocked(true);
    refreshPinState();
  }, [refreshPinState]);

  const openAuthDialog = useCallback(() => {
    setCloudSessionEnabled(true);
    setAuthDialogOpen(true);
  }, []);

  const closeAuthDialog = useCallback(() => {
    setAuthDialogOpen(false);
    setCloudSessionEnabled(true);
  }, []);

  useEffect(() => {
    const status = refreshPinState();
    setPinUnlocked(!status.enabled);
    setPinReady(true);
  }, [refreshPinState]);

  useEffect(() => {
    if (sessionUser && authDialogOpen) {
      setAuthDialogOpen(false);
    }
  }, [authDialogOpen, sessionUser]);

  useEffect(() => {
    if (!pinEnabled) return;
    if (pinLockedUntil <= Date.now()) return;
    const timer = window.setInterval(() => setPinTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [pinEnabled, pinLockedUntil]);

  void pinTick;

  return {
    authReady,
    setAuthReady,
    sessionUser,
    setSessionUser,
    cloudSessionEnabled,
    setCloudSessionEnabled,
    pinReady,
    pinEnabled,
    pinLockedUntil,
    pinUnlocked,
    authDialogOpen,
    handleUnauthorized,
    handlePinVerified,
    handleEnablePin,
    handleDisablePin,
    handleChangePin,
    resetPinAfterForgot,
    openAuthDialog,
    closeAuthDialog
  };
}
