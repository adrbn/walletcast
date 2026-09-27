import Link from "next/link";
import { logoutAction } from "@/server/actions";
import { requireAdmin } from "@/server/auth";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  await requireAdmin();
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border bg-surface">
        <nav className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3 text-sm">
          <Link href="/dashboard" className="font-semibold">
            WalletCast
          </Link>
          <Link href="/dashboard" className="text-muted hover:text-foreground">
            Cards
          </Link>
          <Link href="/dashboard/settings" className="text-muted hover:text-foreground">
            Settings
          </Link>
          <form action={logoutAction} className="ml-auto">
            <button className="text-muted hover:text-foreground">Sign out</button>
          </form>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
