"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getServices } from "@/lib/services";
import { checkPassword, createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { clientIp, createRateLimiter } from "@/lib/http/rateLimit";
import { CardInputSchema, MessageInputSchema } from "@/lib/cards/validation";
import { SlugTakenError } from "@/lib/cards/repository";
import { ImageUploadError, processIconUpload, processLogoUpload } from "@/lib/cards/images";
import { broadcast } from "@/lib/broadcast/broadcast";
import { requireAdmin } from "./auth";

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
  warnings?: string[];
}

const loginLimiter = createRateLimiter({ limit: 10, windowMs: 15 * 60_000 });

function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/dashboard") && !next.startsWith("//") ? next : "/dashboard";
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { config } = await getServices();
  if (!config.adminPassword || !config.sessionSecret) {
    return { error: "ADMIN_PASSWORD and SESSION_SECRET must be set on the server." };
  }
  if (!loginLimiter.hit(clientIp(await headers()))) {
    return { error: "Too many attempts. Wait 15 minutes." };
  }
  const password = formData.get("password");
  if (typeof password !== "string" || !checkPassword(password, config.adminPassword)) {
    return { error: "Wrong password." };
  }
  const token = await createSessionToken(config.sessionSecret);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(config.baseUrl.startsWith("https://")));
  redirect(safeNext(formData.get("next")));
}

export async function logoutAction(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

function formFields(formData: FormData): Record<string, string> {
  return Object.fromEntries(
    [...formData.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

async function parseCardForm(formData: FormData) {
  const parsed = CardInputSchema.safeParse(formFields(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { state: { error: "Please fix the highlighted fields.", fieldErrors } as FormState };
  }
  try {
    const logoFile = formData.get("logo");
    const iconFile = formData.get("icon");
    const images = {
      logo: formData.get("removeLogo") === "on" ? null : await processLogoUpload(logoFile instanceof File ? logoFile : null),
      icon: formData.get("removeIcon") === "on" ? null : await processIconUpload(iconFile instanceof File ? iconFile : null),
    };
    return { input: parsed.data, images };
  } catch (error) {
    if (error instanceof ImageUploadError) return { state: { error: error.message } as FormState };
    throw error;
  }
}

export async function createCardAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const result = await parseCardForm(formData);
  if (!result.input) return result.state;
  const { cards } = await getServices();
  let id: string;
  try {
    id = (await cards.create(result.input, result.images)).id;
  } catch (error) {
    if (error instanceof SlugTakenError) return { error: "This link is already used.", fieldErrors: { slug: "Already taken" } };
    throw error;
  }
  revalidatePath("/dashboard");
  redirect(`/dashboard/cards/${id}`);
}

export async function updateCardAction(cardId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const result = await parseCardForm(formData);
  if (!result.input) return result.state;
  const { cards, subscribers, apns } = await getServices();
  try {
    const card = await cards.update(cardId, result.input, result.images);
    if (!card) return { error: "Card not found." };
  } catch (error) {
    if (error instanceof SlugTakenError) return { error: "This link is already used.", fieldErrors: { slug: "Already taken" } };
    throw error;
  }
  // Silent refresh: Apple devices re-download the pass with the new design.
  if (apns) await apns.sendPassUpdates(await subscribers.applePushTokensForCard(cardId));
  revalidatePath(`/dashboard/cards/${cardId}`);
  return { success: "Saved. Apple passes refresh now; Google passes on the next message." };
}

export async function deleteCardAction(cardId: string): Promise<void> {
  await requireAdmin();
  const { cards } = await getServices();
  await cards.delete(cardId);
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function sendMessageAction(cardId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = MessageInputSchema.safeParse(formFields(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid message" };

  const services = await getServices();
  const { config } = services;
  const result = await broadcast(
    {
      db: services.db,
      baseUrl: config.baseUrl,
      cards: services.cards,
      subscribers: services.subscribers,
      apns: services.apns,
      google: services.googleApi && config.google ? { api: services.googleApi, issuerId: config.google.issuerId } : null,
    },
    cardId,
    parsed.data,
  );
  revalidatePath(`/dashboard/cards/${cardId}`);
  const m = result.message;
  const delivered = m.appleSent + m.googleSent;
  const targets = m.appleTargets + m.googleTargets;
  return {
    success: `Sent to ${delivered} of ${targets} wallet${targets === 1 ? "" : "s"}.`,
    warnings: [...result.warnings, ...result.errors],
  };
}
