import type { Subscriber } from "@/lib/db/schema";

/** RFC 4180 cell, with a guard against spreadsheet formula injection. */
export function csvCell(value: string | null | undefined): string {
  let v = value ?? "";
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function subscribersToCsv(rows: Subscriber[]): string {
  const header = ["added_at", "platform", "status", "email", "placement"];
  const lines = rows.map((r) =>
    [r.createdAt.toISOString(), r.platform, r.status, r.email, r.source].map(csvCell).join(","),
  );
  return [header.join(","), ...lines].join("\r\n") + "\r\n";
}
