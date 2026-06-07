import { notFound } from "next/navigation";

export default async function LetterPage() {
  const enabled = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_LETTER_DEBUG === "true";
  if (!enabled) notFound();
  const { LetterPreviewPage } = await import("./preview");
  return <LetterPreviewPage />;
}
