# Apple Wallet setup

You need an [Apple Developer Program](https://developer.apple.com/programs/) membership (99 $/year, individual or organisation). It takes about 15 minutes.

## 1. Create a Pass Type ID

1. Go to [Certificates, Identifiers & Profiles → Identifiers](https://developer.apple.com/account/resources/identifiers/list/passTypeId).
2. Click **+** and choose **Pass Type IDs**.
3. Description: `WalletCast`. Identifier: `pass.com.yourbusiness.walletcast` (reverse-DNS, must start with `pass.`).

That identifier is your `APPLE_PASS_TYPE_ID`.

## 2. Create the signing certificate

Generate a private key and a certificate signing request (CSR). Keep `signer.key` secret.

```bash
mkdir -p certs && cd certs
openssl req -new -newkey rsa:2048 -nodes \
  -keyout signer.key -out signer.csr \
  -subj "/CN=WalletCast/emailAddress=you@example.com"
```

In the developer portal, open your Pass Type ID, click **Create Certificate**, upload `signer.csr`, and download `pass.cer`. Then convert it to PEM:

```bash
openssl x509 -inform der -in pass.cer -out signer.pem
```

> Already exported a `.p12` from Keychain instead? Split it with
> `openssl pkcs12 -legacy -in cert.p12 -clcerts -nokeys -out signer.pem` and
> `openssl pkcs12 -legacy -in cert.p12 -nocerts -out signer.key`. If the key keeps a
> passphrase, set it in `APPLE_SIGNER_KEY_PASSPHRASE`.

## 3. Download Apple's WWDR certificate (G4)

```bash
curl -sO https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer
openssl x509 -inform der -in AppleWWDRCAG4.cer -out wwdr.pem
```

## 4. Find your Team ID

It is shown under [Membership details](https://developer.apple.com/account#MembershipDetailsCard), a 10-character string like `A1B2C3D4E5`.

## 5. Configure WalletCast

PEM values can be pasted as base64 on one line, which is the most reliable format for hosting dashboards:

```bash
echo "APPLE_SIGNER_CERT=$(base64 -i signer.pem | tr -d '\n')"
echo "APPLE_SIGNER_KEY=$(base64 -i signer.key | tr -d '\n')"
echo "APPLE_WWDR_CERT=$(base64 -i wwdr.pem | tr -d '\n')"
```

```env
APPLE_PASS_TYPE_ID=pass.com.yourbusiness.walletcast
APPLE_TEAM_ID=A1B2C3D4E5
APPLE_SIGNER_CERT=LS0tLS1CRUdJTi...
APPLE_SIGNER_KEY=LS0tLS1CRUdJTi...
APPLE_WWDR_CERT=LS0tLS1CRUdJTi...
```

Restart WalletCast. **Settings** should now show Apple Wallet as *Connected*.

## 6. Test on an iPhone

- `BASE_URL` must be a public **HTTPS** URL. Apple ignores `http://` web services, so passes would install but never update. For local testing, use a tunnel (`cloudflared tunnel --url http://localhost:3000`) and set `BASE_URL` to the tunnel URL.
- Open the card's public page in Safari on the iPhone and tap **Add to Apple Wallet**.
- Send a message from the dashboard. The notification should appear within seconds.

### Troubleshooting

- **The pass won't open** ("Safari cannot download this file"): the certificate doesn't match the Pass Type ID, or the WWDR certificate is wrong. Check the server logs.
- **No notification**:
  - Make sure the device registered. The card shows 1+ Apple subscribers only after the device calls the web service, which requires HTTPS.
  - On the iPhone, open the pass, tap **…**, then **Pass Details**, and check **Allow Notifications**.
- **Device logs**: iOS posts errors to `/api/apple/v1/log`. They appear in the server logs prefixed with `[apple-wallet]`.
- **Pushes**: pass updates always go to APNs production (`api.push.apple.com`) using the same Pass Type ID certificate, so there is no separate APNs key to create.

The certificate expires after one year. Renew it in the portal and replace `APPLE_SIGNER_CERT` (and the key, if you created a new CSR).
