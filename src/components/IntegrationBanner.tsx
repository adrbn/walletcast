import Link from "next/link";
import type { AppConfig } from "@/lib/config/env";

export function IntegrationBanner({ config }: { config: AppConfig }) {
  const missing = [!config.apple && "Apple Wallet", !config.google && "Google Wallet"].filter(Boolean);
  if (missing.length === 0 && config.warnings.length === 0) return null;
  return (
    <div className="mb-6 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
      {missing.length > 0 && (
        <p>
          <strong>{missing.join(" and ")}</strong> {missing.length > 1 ? "are" : "is"} not configured yet, so those
          buttons are hidden on your public pages.{" "}
          <Link href="/dashboard/settings" className="underline">
            How to set it up
          </Link>
        </p>
      )}
      {config.warnings.map((w) => (
        <p key={w} className="mt-1 text-warning">
          {w}
        </p>
      ))}
    </div>
  );
}
