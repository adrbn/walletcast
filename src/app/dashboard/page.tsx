import Link from "next/link";
import type { Metadata } from "next";
import { getServices } from "@/lib/services";
import { IntegrationBanner } from "@/components/IntegrationBanner";

export const metadata: Metadata = { title: "Cards" };

export default async function DashboardPage() {
  const { config, cards } = await getServices();
  const list = await cards.listWithStats();
  return (
    <>
      <IntegrationBanner config={config} />
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Cards</h1>
        <Link href="/dashboard/cards/new" className="btn-primary">
          New card
        </Link>
      </div>
      {list.length === 0 ? (
        <div className="panel py-16 text-center">
          <p className="text-lg font-medium">No cards yet</p>
          <p className="mt-1 text-sm text-muted">
            A card is what people add to their wallet. Once they have it, you can notify them on their lock screen.
          </p>
          <Link href="/dashboard/cards/new" className="btn-primary mt-6">
            Create your first card
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((card) => (
            <Link key={card.id} href={`/dashboard/cards/${card.id}`} className="panel block transition hover:border-accent">
              <div className="mb-4 h-2 rounded-full" style={{ background: card.bgColor }} />
              <p className="text-sm text-muted">{card.organizationName}</p>
              <p className="text-lg font-semibold">{card.name}</p>
              <p className="mt-3 text-sm text-muted">
                {card.appleSubscribers + card.googleSubscribers} subscribers · {card.appleSubscribers} Apple ·{" "}
                {card.googleSubscribers} Google
              </p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
