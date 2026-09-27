import http2 from "node:http2";
import type { AppleConfig } from "@/lib/config/env";
import { mapWithConcurrency } from "@/lib/http/concurrency";

export const APNS_HOST = "https://api.push.apple.com";

export interface PushResult {
  sent: number;
  failed: number;
  /** Tokens APNs reported as no longer valid (HTTP 410 / BadDeviceToken). */
  invalidTokens: string[];
  errors: string[];
}

/** Sends the empty "your pass changed" push. Injected so tests never hit Apple. */
export interface ApnsSender {
  sendPassUpdates(pushTokens: string[]): Promise<PushResult>;
}

type SingleResult = { token: string; status: number; reason?: string };

function pushOne(session: http2.ClientHttp2Session, topic: string, token: string): Promise<SingleResult> {
  return new Promise((resolve) => {
    const req = session.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      "apns-topic": topic,
      "content-type": "application/json",
    });
    let status = 0;
    let body = "";
    req.setEncoding("utf8");
    req.on("response", (headers) => {
      status = Number(headers[":status"]);
    });
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      let reason: string | undefined;
      try {
        reason = body ? (JSON.parse(body) as { reason?: string }).reason : undefined;
      } catch {
        reason = body;
      }
      resolve({ token, status, reason });
    });
    req.on("error", (err) => resolve({ token, status: 0, reason: err.message }));
    req.setTimeout(10_000, () => {
      req.close();
      resolve({ token, status: 0, reason: "timeout" });
    });
    req.end("{}");
  });
}

export function summarisePushResults(results: SingleResult[]): PushResult {
  const summary: PushResult = { sent: 0, failed: 0, invalidTokens: [], errors: [] };
  for (const r of results) {
    if (r.status === 200) {
      summary.sent++;
      continue;
    }
    summary.failed++;
    if (r.status === 410 || r.reason === "BadDeviceToken" || r.reason === "Unregistered") {
      summary.invalidTokens.push(r.token);
    } else if (summary.errors.length < 5) {
      summary.errors.push(`${r.status || "network"}: ${r.reason ?? "unknown"}`);
    }
  }
  return summary;
}

/** Real APNs client (HTTP/2 + Pass Type ID certificate). */
export function createApnsSender(
  apple: AppleConfig,
  options: { host?: string; ca?: string } = {},
): ApnsSender {
  const host = options.host ?? APNS_HOST;
  return {
    async sendPassUpdates(pushTokens) {
      if (pushTokens.length === 0) return { sent: 0, failed: 0, invalidTokens: [], errors: [] };
      const session = http2.connect(host, {
        cert: apple.signerCert,
        key: apple.signerKey,
        passphrase: apple.signerKeyPassphrase,
        ca: options.ca,
      });
      const connectionError = new Promise<Error>((resolve) => session.once("error", resolve));
      try {
        const results = await Promise.race([
          mapWithConcurrency(pushTokens, 20, (token) => pushOne(session, apple.passTypeId, token)),
          connectionError.then((err) => pushTokens.map((token) => ({ token, status: 0, reason: err.message }))),
        ]);
        return summarisePushResults(results);
      } finally {
        session.close();
      }
    },
  };
}
