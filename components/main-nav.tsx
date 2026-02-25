"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock3, PenLine, Settings, Sparkles, Stars } from "lucide-react";
import clsx from "clsx";

const links = [
  { href: "/feed", label: "投喂", icon: PenLine },
  { href: "/timeline", label: "回看", icon: Clock3 },
  { href: "/sky", label: "聚集", icon: Sparkles },
  { href: "/settings", label: "设置", icon: Settings }
];

export function MainNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-night-950/90 backdrop-blur-lg">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 md:px-6">
        <Link href="/feed" className="flex items-center gap-2 text-starlight-white">
          <Stars className="h-4 w-4 text-starlight-blue" />
          <span className="text-xl font-semibold tracking-wide">知惑 Zhihuo</span>
        </Link>

        <nav className="flex items-center gap-1">
          {links.map((link) => {
            const active = pathname?.startsWith(link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  "flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-white/10 text-starlight-white"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
