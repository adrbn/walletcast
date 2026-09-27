import type { Metadata } from "next";
import { CardForm } from "@/components/CardForm";
import { createCardAction } from "@/server/actions";

export const metadata: Metadata = { title: "New card" };

export default function NewCardPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">New card</h1>
      <CardForm action={createCardAction} submitLabel="Create card" />
    </>
  );
}
