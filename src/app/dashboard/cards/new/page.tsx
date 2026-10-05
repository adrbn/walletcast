import type { Metadata } from "next";
import { CardForm } from "@/components/CardForm";
import { getConfig } from "@/lib/config/env";
import { glowSlot, slotHue } from "@/lib/glow/hue";
import { createCardAction } from "@/server/actions";

export const metadata: Metadata = { title: "New card" };

export default function NewCardPage() {
  const glowHue = slotHue(glowSlot(new Date(), getConfig().glowTimeZone));
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">New card</h1>
      <CardForm action={createCardAction} submitLabel="Create card" glowHue={glowHue} />
    </>
  );
}
