import forge from "node-forge";
import type { AppleConfig } from "@/lib/config/env";

export interface TestCert {
  cert: string;
  key: string;
}

/** Self-signed certificate for tests (never trusted by Apple, fine for signing & TLS). */
export function createSelfSignedCert(commonName = "localhost"): TestCert {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + 24 * 3600_000);
  const attrs = [{ name: "commonName", value: commonName }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: "basicConstraints", cA: true },
    { name: "subjectAltName", altNames: [{ type: 2, value: commonName }, { type: 7, ip: "127.0.0.1" }] },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { cert: forge.pki.certificateToPem(cert), key: forge.pki.privateKeyToPem(keys.privateKey) };
}

let cachedApple: AppleConfig | null = null;

export function testAppleConfig(): AppleConfig {
  if (!cachedApple) {
    const signer = createSelfSignedCert("Pass Type ID: pass.dev.walletcast.test");
    cachedApple = {
      passTypeId: "pass.dev.walletcast.test",
      teamId: "TEAMID1234",
      signerCert: signer.cert,
      signerKey: signer.key,
      wwdr: signer.cert,
    };
  }
  return cachedApple;
}
