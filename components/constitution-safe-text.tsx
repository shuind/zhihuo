"use client";

import { guardOutput } from "@/lib/constitution";
import { GuardScene } from "@/lib/types";

interface ConstitutionSafeTextProps {
  scene: GuardScene;
  text: string;
  fallback?: string;
  className?: string;
}

export function ConstitutionSafeText({
  scene,
  text,
  fallback = "这段提示暂时留空，让你自己命名它。",
  className
}: ConstitutionSafeTextProps) {
  const result = guardOutput(scene, text);

  if (!result.ok) {
    return <p className={className}>{fallback}</p>;
  }

  return <p className={className}>{result.text}</p>;
}
