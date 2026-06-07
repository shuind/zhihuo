export function requireString(record: Record<string, unknown> | null | undefined, key: string) {
  return typeof record?.[key] === "string" ? String(record[key]) : null;
}

export function toPayloadRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
