"use client";

import { useEffect } from "react";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])'
].join(",");

function visibleDialogs() {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]')
  ).filter((dialog) => dialog.getClientRects().length > 0 && dialog.getAttribute("aria-hidden") !== "true");
}

export function useDialogFocusManagement() {
  useEffect(() => {
    let activeDialog: HTMLElement | null = null;
    let restoreTarget: HTMLElement | null = null;
    let focusFrame = 0;

    const syncDialog = () => {
      const nextDialog = visibleDialogs().at(-1) ?? null;
      if (nextDialog === activeDialog) return;
      if (!nextDialog) {
        activeDialog = null;
        const target = restoreTarget;
        restoreTarget = null;
        if (target?.isConnected) target.focus({ preventScroll: true });
        return;
      }
      if (!activeDialog && document.activeElement instanceof HTMLElement) {
        restoreTarget = document.activeElement;
      }
      activeDialog = nextDialog;
      window.cancelAnimationFrame(focusFrame);
      focusFrame = window.requestAnimationFrame(() => {
        if (!activeDialog) return;
        const autoFocus = activeDialog.querySelector<HTMLElement>("[autofocus]");
        const firstFocusable = activeDialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
        (autoFocus ?? firstFocusable ?? activeDialog).focus({ preventScroll: true });
      });
    };

    const observer = new MutationObserver(syncDialog);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "aria-hidden"] });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !activeDialog) return;
      const focusable = Array.from(activeDialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => element.getClientRects().length > 0
      );
      if (!focusable.length) {
        event.preventDefault();
        activeDialog.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    syncDialog();
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", handleKeyDown);
      window.cancelAnimationFrame(focusFrame);
    };
  }, []);
}
