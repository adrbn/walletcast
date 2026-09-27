import type { Metadata } from "next";
import { getServices } from "@/lib/services";
import { APPLE_WEB_SERVICE_PATH } from "@/lib/apple/pass";

export const metadata: Metadata = { title: "Settings" };

const DOCS = "https://github.com/adrbn/walletcast/blob/main/docs";

function Status({ ok }: { ok: boolean }) {
  return <span className={`badge ${ok ? "text-success" : "text-warning"}`}>{ok ? "Connected" : "Not configured"}</span>;
}

export default async function SettingsPage() {
  const { config } = await getServices();
  const rows: [string, string][] = [
    ["Public URL (BASE_URL)", config.baseUrl],
    ["Database", config.databaseUrl ? "PostgreSQL (DATABASE_URL)" : `Embedded PGlite (${config.pgliteDir})`],
    ["Apple web service", `${config.baseUrl}${APPLE_WEB_SERVICE_PATH}`],
  ];
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="text-sm text-muted">
        WalletCast is configured with environment variables, so secrets never live in the database. Change them in your
        host (Vercel, Docker, .env.local) and restart.
      </p>

      <section className="panel space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Apple Wallet</h2>
          <Status ok={Boolean(config.apple)} />
        </div>
        {config.apple ? (
          <p className="text-sm text-muted">
            Pass type <code>{config.apple.passTypeId}</code> · Team <code>{config.apple.teamId}</code>
          </p>
        ) : (
          <p className="text-sm text-muted">
            Needs an Apple Developer account (99 $/year), a Pass Type ID certificate and the WWDR certificate.{" "}
            <a className="underline" href={`${DOCS}/setup-apple.md`}>
              Step-by-step guide
            </a>
          </p>
        )}
      </section>

      <section className="panel space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Google Wallet</h2>
          <Status ok={Boolean(config.google)} />
        </div>
        {config.google ? (
          <p className="text-sm text-muted">
            Issuer <code>{config.google.issuerId}</code> · {config.google.serviceAccount.client_email}
          </p>
        ) : (
          <p className="text-sm text-muted">
            Free. Needs a Google Wallet issuer account and a Google Cloud service account.{" "}
            <a className="underline" href={`${DOCS}/setup-google.md`}>
              Step-by-step guide
            </a>
          </p>
        )}
        <p className="text-xs text-muted">
          Google shows at most about 3 notifications per pass per 24 hours. Extra messages still update the card
          silently.
        </p>
      </section>

      <section className="panel">
        <h2 className="mb-3 text-lg font-semibold">Server</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-[220px_1fr]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="break-all font-mono text-xs">{v}</dd>
            </div>
          ))}
        </dl>
        {config.warnings.length > 0 && (
          <ul className="mt-4 list-disc pl-5 text-sm text-warning">
            {config.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
