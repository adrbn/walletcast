import { importPKCS8, SignJWT } from "jose";
import { GoogleAuth } from "google-auth-library";
import type { GoogleConfig } from "@/lib/config/env";

export const WALLET_API = "https://walletobjects.googleapis.com/walletobjects/v1";
export const WALLET_SCOPE = "https://www.googleapis.com/auth/wallet_object.issuer";

export class GoogleWalletError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GoogleWalletError";
  }
}

/** The subset of the Google Wallet REST API WalletCast uses. Injected for tests. */
export interface GoogleWalletApi {
  upsertGenericClass(genericClass: { id: string }): Promise<void>;
  patchGenericObject(id: string, patch: object): Promise<void>;
  addMessageToGenericObject(id: string, message: object): Promise<void>;
}

type Fetch = typeof fetch;
type TokenProvider = () => Promise<string>;

export function createGoogleWalletApi(
  config: GoogleConfig,
  deps: { fetch?: Fetch; getAccessToken?: TokenProvider } = {},
): GoogleWalletApi {
  const doFetch = deps.fetch ?? fetch;
  const getAccessToken: TokenProvider =
    deps.getAccessToken ??
    (() => {
      const auth = new GoogleAuth({ credentials: config.serviceAccount, scopes: [WALLET_SCOPE] });
      return async () => {
        const token = await auth.getAccessToken();
        if (!token) throw new GoogleWalletError("Could not obtain a Google access token", 401);
        return token;
      };
    })();

  async function call(method: string, path: string, body?: object): Promise<Response> {
    const res = await doFetch(`${WALLET_API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${await getAccessToken()}`,
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res;
  }

  async function expectOk(res: Response, what: string): Promise<void> {
    if (res.ok) return;
    const text = await res.text().catch(() => "");
    throw new GoogleWalletError(`${what} failed (${res.status}): ${text.slice(0, 300)}`, res.status);
  }

  return {
    async upsertGenericClass(genericClass) {
      const existing = await call("GET", `/genericClass/${encodeURIComponent(genericClass.id)}`);
      if (existing.status === 404) {
        await expectOk(await call("POST", "/genericClass", genericClass), "Create class");
        return;
      }
      await expectOk(existing, "Read class");
      await expectOk(
        await call("PUT", `/genericClass/${encodeURIComponent(genericClass.id)}`, genericClass),
        "Update class",
      );
    },

    async patchGenericObject(id, patch) {
      await expectOk(await call("PATCH", `/genericObject/${encodeURIComponent(id)}`, patch), "Update object");
    },

    async addMessageToGenericObject(id, message) {
      await expectOk(
        await call("POST", `/genericObject/${encodeURIComponent(id)}/addMessage`, message),
        "Send message",
      );
    },
  };
}

/**
 * "Add to Google Wallet" link. The object is embedded in the signed JWT and
 * created by Google when the user saves it.
 */
export async function createSaveUrl(
  config: GoogleConfig,
  genericObject: object,
  origin: string,
): Promise<string> {
  const key = await importPKCS8(config.serviceAccount.private_key, "RS256");
  const jwt = await new SignJWT({
    origins: [origin],
    typ: "savetowallet",
    payload: { genericObjects: [genericObject] },
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(config.serviceAccount.client_email)
    .setAudience("google")
    .setIssuedAt()
    .sign(key);
  return `https://pay.google.com/gp/v/save/${jwt}`;
}
