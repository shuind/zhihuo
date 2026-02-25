"use client";

import { ZhihuoStoreProvider } from "@/lib/store";

export function Providers({ children }: { children: React.ReactNode }) {
  return <ZhihuoStoreProvider>{children}</ZhihuoStoreProvider>;
}
