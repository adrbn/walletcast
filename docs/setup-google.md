# Google Wallet setup

It's free. You need a Google account, and it takes about 20 minutes plus Google's review before going public.

## 1. Create an issuer account

1. Open the [Google Pay & Wallet Console](https://pay.google.com/business/console).
2. Go to **Google Wallet API** and follow the steps to create an issuer.
3. Copy the **Issuer ID** (a long number). It becomes `GOOGLE_ISSUER_ID`.

## 2. Create a service account

1. In the [Google Cloud Console](https://console.cloud.google.com/), create or select a project.
2. Enable the **Google Wallet API** (APIs & Services → Library).
3. Go to IAM & Admin → **Service Accounts**, create one (for example `walletcast`), and skip the optional roles.
4. Open it, go to **Keys**, choose **Add key**, then **JSON**, and download the file.

## 3. Authorise the service account on your issuer

Back in the Pay & Wallet Console, go to **Users** and invite the service account email (`walletcast@your-project.iam.gserviceaccount.com`) with the **Developer** role.

## Configure WalletCast

```bash
echo "GOOGLE_SERVICE_ACCOUNT_JSON=$(base64 -i key.json | tr -d '\n')"
```

```env
GOOGLE_ISSUER_ID=3388000000012345678
GOOGLE_SERVICE_ACCOUNT_JSON=eyJ0eXBlIjoic2VydmljZV9hY2NvdW50Ii...
```

Raw JSON on one line also works. Restart WalletCast, and **Settings** should show Google Wallet as *Connected*.

`BASE_URL` must be publicly reachable over HTTPS: Google downloads the card's logo and icon from `BASE_URL/api/cards/<id>/image/...`.

## 4. Go live

New issuers are in **demo mode**. Only accounts listed as test users in the console can save passes, and the passes carry a "TEST ONLY" banner. When your card looks right:

1. In the Pay & Wallet Console, open **Google Wallet API** and click **Request publishing access**.
2. Fill in your business details. Google usually replies within a few days.

## Notification limits

WalletCast sends each broadcast as a `TEXT_AND_NOTIFY` message on every pass. Google **delivers at most about 3 notifications per pass per 24 hours**. Beyond that the pass still updates, but silently. The dashboard warns you when you exceed this.

Users can disable notifications per pass in Google Wallet.

### Troubleshooting

- **"Could not create the Google Wallet pass"**: the service account isn't a user on the issuer (step 3), or the Wallet API isn't enabled (step 2). Check the server logs for the Google error message.
- **Save link opens but fails**: `BASE_URL` does not match the domain the button was clicked from. The save JWT lists `BASE_URL` as its allowed origin.
