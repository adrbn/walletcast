import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getServices } from "@/lib/services";
import { publicCardUrl } from "@/lib/cards/links";
import { imageUrl } from "@/lib/google/objects";
import { glowSlot, slotHue } from "@/lib/glow/hue";
import { CardForm } from "@/components/CardForm";
import { SendForm } from "@/components/SendForm";
import { QrPanel } from "@/components/QrPanel";
import { deleteCardAction, sendMessageAction, updateCardAction } from "@/server/actions";

export const metadata: Metadata = { title: "Card" };

const dateFmt = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

export default async function CardPage({ params }: PageProps<"/dashboard/cards/[id]">) {
  const { id } = await params;
  const { config, cards, subscribers } = await getServices();
  const card = await cards.findById(id);
  if (!card) notFound();

  const [stats, history, sources] = await Promise.all([
    cards.listWithStats().then((all) => all.find((c) => c.id === id)),
    cards.listMessages(id, 20),
    subscribers.countBySource(id),
  ]);
  const apple = stats?.appleSubscribers ?? 0;
  const google = stats?.googleSubscribers ?? 0;
  const link = publicCardUrl(config.baseUrl, card.slug);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{card.organizationName}</p>
          <h1 className="text-2xl font-semibold">{card.name}</h1>
        </div>
        <a href={link} target="_blank" className="btn-secondary" rel="noreferrer">
          Open public page ↗
        </a>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel">
          <h2 className="mb-1 text-lg font-semibold">Send a notification</h2>
          <p className="mb-4 text-sm text-muted">
            Appears on the lock screen of everyone who has the card, and stays on the card as the latest message.
          </p>
          <SendForm action={sendMessageAction.bind(null, card.id)} subscriberCount={apple + google} />
        </section>

        <section className="panel">
          <h2 className="mb-1 text-lg font-semibold">Share</h2>
          <p className="mb-4 text-sm text-muted">Print the QR code or share the link. One tap adds the card.</p>
          <QrPanel cardId={card.id} baseLink={link} />
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="panel">
          <h2 className="mb-4 text-lg font-semibold">Subscribers</h2>
          <p className="text-3xl font-semibold">{apple + google}</p>
          <p className="text-sm text-muted">
            {apple} Apple Wallet · {google} Google Wallet
          </p>
          {sources.length > 0 && (
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="font-normal">Placement</th>
                  <th className="text-right font-normal">Added</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.source ?? "direct"}>
                    <td>{s.source ?? "direct link"}</td>
                    <td className="text-right">{s.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <a href={`/api/cards/${card.id}/subscribers.csv`} className="btn-secondary mt-4">
            Export CSV
          </a>
        </section>

        <section className="panel lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold">History</h2>
          {history.length === 0 ? (
            <p className="text-sm text-muted">No notification sent yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {history.map((m) => (
                <li key={m.id} className="py-3">
                  <div className="flex justify-between gap-4">
                    <p className="font-medium">{m.title}</p>
                    <p className="shrink-0 text-xs text-muted">{dateFmt.format(m.createdAt)}</p>
                  </div>
                  <p className="text-sm">{m.body}</p>
                  <p className="mt-1 text-xs text-muted">
                    Apple {m.appleSent}/{m.appleTargets} · Google {m.googleSent}/{m.googleTargets}
                    {m.appleFailed + m.googleFailed > 0 && ` · ${m.appleFailed + m.googleFailed} failed`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="panel">
        <h2 className="mb-6 text-lg font-semibold">Design & details</h2>
        <CardForm
          action={updateCardAction.bind(null, card.id)}
          submitLabel="Save changes"
          latestMessage={card.latestMessage}
          qrUrl={`/api/cards/${card.id}/qr?src=pass`}
          glowHue={slotHue(glowSlot(new Date(), config.glowTimeZone))}
          existingLogoUrl={card.logo ? imageUrl("", card, "logo") : null}
          existingIconUrl={imageUrl("", card, "icon")}
          initial={{
            name: card.name,
            organizationName: card.organizationName,
            slug: card.slug,
            description: card.description,
            welcomeText: card.welcomeText,
            websiteUrl: card.websiteUrl ?? "",
            bgColor: card.bgColor,
            fgColor: card.fgColor,
            labelColor: card.labelColor,
            latestLabel: card.latestLabel,
            contactUrl: card.contactUrl ?? "",
            barcode: card.barcode,
            dayGlow: card.dayGlow,
          }}
        />
      </section>

      <section className="panel border-danger/40">
        <h2 className="mb-1 text-lg font-semibold">Delete card</h2>
        <p className="mb-4 text-sm text-muted">
          Removes the card, its subscribers and history. Passes already in wallets stop updating.
        </p>
        <form action={deleteCardAction.bind(null, card.id)}>
          <button className="btn-danger">Delete permanently</button>
        </form>
      </section>
    </div>
  );
}
