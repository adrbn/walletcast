import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { userAgent } from "next/server";
import { getServices } from "@/lib/services";
import { imageUrl } from "@/lib/google/objects";
import { latestMessageText } from "@/lib/apple/pass";
import { normaliseSource } from "@/lib/cards/links";
import { glowSlot, slotHue } from "@/lib/glow/hue";
import { PassPreview } from "@/components/PassPreview";

export async function generateMetadata({ params }: PageProps<"/c/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { cards } = await getServices();
  const card = await cards.findBySlug(slug);
  return card
    ? { title: { absolute: card.name }, description: `Add ${card.name} to your wallet.` }
    : { title: "Card not found" };
}

export default async function PublicCardPage({ params, searchParams }: PageProps<"/c/[slug]">) {
  const { slug } = await params;
  const { src, error } = await searchParams;
  const { config, cards } = await getServices();
  const card = await cards.findBySlug(slug);
  if (!card) notFound();

  const os = userAgent({ headers: await headers() }).os.name ?? "";
  const isAndroid = /android/i.test(os);
  const isApple = /ios|mac/i.test(os);
  const source = normaliseSource(typeof src === "string" ? src : null);
  // Only offer the wallet the visitor can use; desktop visitors see both.
  const buttons = [
    config.apple && !isAndroid && { key: "apple", label: "Add to Apple Wallet", action: `/api/passes/apple/${card.slug}` },
    config.google && !isApple && { key: "google", label: "Add to Google Wallet", action: `/api/passes/google/${card.slug}` },
  ].filter((b): b is { key: string; label: string; action: string } => Boolean(b));
  const websiteHost = card.websiteUrl ? new URL(card.websiteUrl).host : null;

  return (
    <main className="flex flex-1 flex-col items-center px-5 py-10" style={{ background: `${card.bgColor}14` }}>
      <div className="w-full max-w-sm space-y-6">
        <PassPreview
          organizationName={card.organizationName}
          name={card.name}
          message={latestMessageText(card)}
          bgColor={card.bgColor}
          fgColor={card.fgColor}
          labelColor={card.labelColor}
          logoUrl={card.logo ? imageUrl("", card, "logo") : null}
          iconUrl={imageUrl("", card, "icon")}
          latestLabel={card.latestLabel}
          logoText={card.logoText}
          headerLabel={card.headerLabel}
          headerValue={card.headerValue}
          barcode={card.barcode}
          qrUrl={`/api/cards/${card.id}/qr?src=pass`}
          glowHue={card.dayGlow ? slotHue(glowSlot(new Date(), config.glowTimeZone)) : null}
        />

        <div className="space-y-2 text-center">
          <h1 className="text-xl font-semibold">Add {card.name} to your wallet</h1>
          {card.description && <p className="text-sm text-muted">{card.description}</p>}
          <p className="text-xs text-muted">No app, no account. Remove the card anytime to stop.</p>
        </div>

        {buttons.length === 0 ? (
          <div className="space-y-3">
            {card.contactUrl && (
              <a href={card.contactUrl} className="btn-primary block w-full py-3 text-center text-base">
                Save contact
              </a>
            )}
            {card.websiteUrl && (
              <a href={card.websiteUrl} className="btn-secondary block w-full py-3 text-center text-base">
                {websiteHost}
              </a>
            )}
            {!card.contactUrl && !card.websiteUrl && (
              <p className="panel text-center text-sm text-muted">This card is not available yet.</p>
            )}
          </div>
        ) : (
          <form method="post" className="space-y-3">
            {source && <input type="hidden" name="src" value={source} />}
            <label className="block">
              <span className="field-label">Email (optional)</span>
              <input name="email" type="email" className="input" placeholder="you@example.com" autoComplete="email" />
            </label>
            {buttons.map((b, i) => (
              <button
                key={b.key}
                formAction={b.action}
                className={`${i === 0 ? "btn-primary" : "btn-secondary"} w-full py-3 text-base`}
              >
                {b.label}
              </button>
            ))}
            {error && (
              <p className="text-center text-sm text-danger">
                {error === "429" ? "Too many attempts, try again in a minute." : error === "400" ? "That email address looks invalid." : "Something went wrong. Please try again."}
              </p>
            )}
            {card.contactUrl && (
              <a href={card.contactUrl} className="block text-center text-sm underline">
                Save contact
              </a>
            )}
          </form>
        )}
        <p className="text-center text-xs text-muted">
          Powered by{" "}
          <a href="https://github.com/adrbn/walletcast" className="underline">
            WalletCast
          </a>
        </p>
      </div>
    </main>
  );
}
