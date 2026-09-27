import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="panel w-full max-w-sm space-y-5">
        <div>
          <h1 className="text-xl font-semibold">WalletCast</h1>
          <p className="text-sm text-muted">Sign in to your dashboard.</p>
        </div>
        <LoginForm next={typeof next === "string" ? next : "/dashboard"} />
      </div>
    </main>
  );
}
