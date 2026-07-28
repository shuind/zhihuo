"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

export function MenuItem(props: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      className={cn(
        "block w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors",
        props.disabled ? "cursor-not-allowed text-slate-600" : "text-slate-700 hover:bg-slate-100"
      )}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  );
}

export function NodeMenu(props: {
  disabled: boolean;
  onEdit: () => void;
  onCopy: () => void;
  onMarkMisplaced?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  openRequestNonce?: number;
  onDelete: () => void;
  imageSrc?: string | null;
  imageAlt?: string;
  imageBusy?: boolean;
  canManageImage?: boolean;
  onAddImage?: () => void;
  onPreviewImage?: () => void;
  onReplaceImage?: () => void;
  onRemoveImage?: () => void;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number } | null>(null);
  const hasImage = Boolean(props.imageSrc);
  const triggerDisabled = props.disabled || props.imageBusy;
  const lastOpenRequestRef = useRef(props.openRequestNonce);

  useEffect(() => {
    if (props.openRequestNonce === undefined || props.openRequestNonce === lastOpenRequestRef.current) return;
    lastOpenRequestRef.current = props.openRequestNonce;
    setOpen(true);
  }, [props.openRequestNonce]);

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuWidth = 192;
      const left = Math.min(rect.left - 12, window.innerWidth - menuWidth - 12);
      const top = Math.min(rect.bottom + 8, window.innerHeight - 260);
      setMenuStyle({
        top: Math.max(12, top),
        left: Math.max(12, left)
      });
    };
    updatePosition();
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (
        event.target instanceof Node &&
        !menuRef.current.contains(event.target) &&
        !triggerRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onScroll = () => setOpen(false);
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const runAction = (fn: () => void) => {
    fn();
    setOpen(false);
  };

  const menuContent = (
    <div
      ref={menuRef}
      role="menu"
      aria-hidden={!open}
      style={menuStyle ?? undefined}
      className={cn(
        "fixed z-[80] w-48 rounded-xl border border-black/12 bg-white p-1.5 shadow-[0_10px_22px_rgba(15,23,42,0.16)]",
        open ? "block" : "hidden"
      )}
    >
      {hasImage ? (
        <>
          {props.onPreviewImage ? <MenuItem label="查看图片" disabled={triggerDisabled} onClick={() => runAction(props.onPreviewImage as () => void)} /> : null}
          {props.canManageImage && props.onReplaceImage ? (
            <MenuItem label={props.imageBusy ? "处理中..." : "更换图片"} disabled={triggerDisabled} onClick={() => runAction(props.onReplaceImage as () => void)} />
          ) : null}
          {props.canManageImage && props.onRemoveImage ? (
            <MenuItem label="移除图片" disabled={triggerDisabled} onClick={() => runAction(props.onRemoveImage as () => void)} />
          ) : null}
          {(props.onPreviewImage || (props.canManageImage && (props.onReplaceImage || props.onRemoveImage))) ? <div className="my-1 h-px bg-black/8" /> : null}
        </>
      ) : props.canManageImage && props.onAddImage ? (
        <>
          <MenuItem label={props.imageBusy ? "处理中..." : "添加图片"} disabled={triggerDisabled} onClick={() => runAction(props.onAddImage as () => void)} />
          <div className="my-1 h-px bg-black/8" />
        </>
      ) : null}
      <button
        type="button"
        role="menuitem"
        disabled={props.disabled}
        className="block w-full rounded-lg px-2 py-1 text-left text-[11px] text-slate-700 transition-colors hover:bg-slate-100 disabled:text-slate-600"
        onClick={() => runAction(props.onEdit)}
      >
        修改
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={props.disabled}
        className="block w-full rounded-lg px-2 py-1 text-left text-[11px] text-slate-700 transition-colors hover:bg-slate-100 disabled:text-slate-600"
        onClick={() => runAction(props.onCopy)}
      >
        复制
      </button>
      {props.onMarkMisplaced ? (
        <button
          type="button"
          role="menuitem"
          disabled={props.disabled}
          className="block w-full rounded-lg px-2 py-1 text-left text-[11px] text-slate-700 transition-colors hover:bg-slate-100 disabled:text-slate-600"
          onClick={() => runAction(props.onMarkMisplaced as () => void)}
        >
          先放这里
        </button>
      ) : null}
      {props.onMoveUp ? (
        <MenuItem label="上移" disabled={props.disabled} onClick={() => runAction(props.onMoveUp as () => void)} />
      ) : null}
      {props.onMoveDown ? (
        <MenuItem label="下移" disabled={props.disabled} onClick={() => runAction(props.onMoveDown as () => void)} />
      ) : null}
      <div className="my-1 h-px bg-black/8" />
      <button
        type="button"
        role="menuitem"
        disabled={props.disabled}
        className="block w-full rounded-lg px-2 py-1 text-left text-[11px] text-slate-700 transition-colors hover:bg-slate-100 disabled:text-slate-600"
        onClick={() => runAction(props.onDelete)}
      >
        删除
      </button>
    </div>
  );

  return (
    <div className={cn("relative inline-block", props.triggerClassName)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={hasImage ? "节点图片菜单" : "节点菜单"}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "relative flex items-center justify-center overflow-hidden transition-colors",
          hasImage
            ? "h-9 w-9 rounded-[12px] bg-transparent"
            : "h-7 w-7 rounded-full bg-transparent text-slate-600 hover:bg-white/80 hover:text-slate-700",
          triggerDisabled ? "cursor-not-allowed opacity-60" : open ? "cursor-pointer" : "cursor-pointer hover:bg-black/[0.025]"
        )}
        disabled={triggerDisabled}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
      >
        {hasImage && props.imageSrc ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- node images can be offline blob URLs. */}
            <img src={props.imageSrc} alt={props.imageAlt ?? "节点图片"} className="h-full w-full rounded-[12px] object-cover" />
          </>
        ) : (
          <span aria-hidden="true" className="text-base leading-none">
            ⋯
          </span>
        )}
      </button>
      {typeof document !== "undefined" ? createPortal(menuContent, document.body) : null}
    </div>
  );
}
