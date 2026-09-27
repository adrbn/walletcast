import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <p className="badge w-fit">Open source · self-hosted</p>
      <h1 className="text-4xl font-semibold tracking-tight">WalletCast</h1>
      <p className="text-lg text-muted">
        Put a card in your customers&apos; Apple or Google Wallet with one tap, then send them
        lock-screen notifications whenever you want. No app to build, no app to install.
      </p>
      <div className="flex gap-3">
        <Link href="/dashboard" className="btn-primary">
          Open dashboard
        </Link>
        <a href="https://github.com/adrbn/walletcast" className="btn-secondary">
          Source code
        </a>
      </div>
    </main>
  );
}
