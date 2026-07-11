"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";

import { clearLastUserMarker } from "@/components/offline-store";

export type SessionUser = {
  userId: string;
  email: string;
};

type UseAuthGateOptions = {
  showNotice: (message: string, duration?: number) => void;
  onUnauthorized?: () => void;
};

export type AuthGate = {
  authReady: boolean;
  setAuthReady: Dispatch<SetStateAction<boolean>>;
  sessionUser: SessionUser | null;
  setSessionUser: Dispatch<SetStateAction<SessionUser | null>>;
  cloudSessionEnabled: boolean;
  setCloudSessionEnabled: Dispatch<SetStateAction<boolean>>;
  authDialogOpen: boolean;
  handleUnauthorized: (response: Response) => boolean;
  openAuthDialog: () => void;
  closeAuthDialog: () => void;
};

export function useAuthGate({ showNotice, onUnauthorized }: UseAuthGateOptions): AuthGate {
  const [authReady, setAuthReady] = useState(false);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [cloudSessionEnabled, setCloudSessionEnabled] = useState(true);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);

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

  const openAuthDialog = useCallback(() => {
    setCloudSessionEnabled(true);
    setAuthDialogOpen(true);
  }, []);

  const closeAuthDialog = useCallback(() => {
    setAuthDialogOpen(false);
    setCloudSessionEnabled(true);
  }, []);

  useEffect(() => {
    if (sessionUser && authDialogOpen) setAuthDialogOpen(false);
  }, [authDialogOpen, sessionUser]);

  return {
    authReady,
    setAuthReady,
    sessionUser,
    setSessionUser,
    cloudSessionEnabled,
    setCloudSessionEnabled,
    authDialogOpen,
    handleUnauthorized,
    openAuthDialog,
    closeAuthDialog
  };
}
