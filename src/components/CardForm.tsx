"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import type { FormState } from "@/server/actions";
import { slugify } from "@/lib/cards/validation";
import { PassPreview } from "./PassPreview";

export interface CardFormValues {
  name: string;
  organizationName: string;
  slug: string;
  description: string;
  welcomeText: string;
  websiteUrl: string;
  bgColor: string;
  fgColor: string;
  labelColor: string;
  latestLabel: string;
  contactUrl: string;
  logoText: string;
  headerLabel: string;
  headerValue: string;
  nameLabel: string;
  barcode: boolean;
  dayGlow: boolean;
}

type TextField = Exclude<keyof CardFormValues, "barcode" | "dayGlow">;

const TOGGLES = [
  ["barcode", "Share QR on the card", "Anyone holding the card can show it to pass it on."],
  ["dayGlow", "Glow that follows the hour", "A colour strip that shifts from violet at night to amber by day, updated silently."],
] as const;

const DEFAULTS: CardFormValues = {
  name: "",
  organizationName: "",
  slug: "",
  description: "",
  welcomeText: "Thanks for adding our card! We'll keep you posted here.",
  websiteUrl: "",
  bgColor: "#111827",
  fgColor: "#ffffff",
  labelColor: "#9ca3af",
  latestLabel: "LATEST",
  contactUrl: "",
  logoText: "",
  headerLabel: "",
  headerValue: "",
  nameLabel: "",
  barcode: false,
  dayGlow: false,
};

interface Props {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  initial?: Partial<CardFormValues>;
  existingLogoUrl?: string | null;
  existingIconUrl?: string | null;
  latestMessage?: string | null;
  /** QR shown in the preview once the card exists. */
  qrUrl?: string;
  /** Current day-glow hue, computed on the server so the preview matches the pass. */
  glowHue: number;
  submitLabel: string;
}

function useObjectUrl(file: File | null): string | null {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  return url;
}

export function CardForm({ action, initial, existingLogoUrl, existingIconUrl, latestMessage, qrUrl, glowHue, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const [values, setValues] = useState<CardFormValues>({ ...DEFAULTS, ...initial });
  const [slugTouched, setSlugTouched] = useState(Boolean(initial?.slug));
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const logoPreview = useObjectUrl(logoFile);
  const iconPreview = useObjectUrl(iconFile);

  const set = (key: TextField) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "name" && !slugTouched) next.slug = slugify(value);
      return next;
    });
  };
  const err = (key: string) =>
    state.fieldErrors?.[key] ? <p className="mt-1 text-xs text-danger">{state.fieldErrors[key]}</p> : null;

  return (
    <form action={formAction} className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Business name</span>
            <input name="organizationName" className="input" required maxLength={60} value={values.organizationName} onChange={set("organizationName")} />
            {err("organizationName")}
          </label>
          <label className="block">
            <span className="field-label">Card name</span>
            <input name="name" className="input" required maxLength={60} value={values.name} onChange={set("name")} placeholder="VIP Club" />
            {err("name")}
          </label>
        </div>

        <label className="block">
          <span className="field-label">Public link</span>
          <div className="flex items-center gap-1 text-sm">
            <span className="text-muted">/c/</span>
            <input
              name="slug"
              className="input"
              required
              maxLength={48}
              value={values.slug}
              onChange={(e) => {
                setSlugTouched(true);
                set("slug")(e);
              }}
            />
          </div>
          {err("slug")}
        </label>

        <label className="block">
          <span className="field-label">Message shown when the card is added</span>
          <input name="welcomeText" className="input" maxLength={200} value={values.welcomeText} onChange={set("welcomeText")} />
          <p className="field-hint">Replaced by your latest broadcast once you send one.</p>
        </label>

        <label className="block">
          <span className="field-label">Description (back of the card)</span>
          <textarea name="description" className="input min-h-20" maxLength={500} value={values.description} onChange={set("description")} />
        </label>

        <label className="block">
          <span className="field-label">Website</span>
          <input name="websiteUrl" type="url" className="input" placeholder="https://" value={values.websiteUrl} onChange={set("websiteUrl")} />
          {err("websiteUrl")}
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Label of the latest message</span>
            <input name="latestLabel" className="input" maxLength={12} value={values.latestLabel} onChange={set("latestLabel")} />
            {err("latestLabel")}
          </label>
          <label className="block">
            <span className="field-label">Contact file (vCard link)</span>
            <input name="contactUrl" type="url" className="input" placeholder="https://" value={values.contactUrl} onChange={set("contactUrl")} />
            <p className="field-hint">Adds a Save contact button to the public page.</p>
            {err("contactUrl")}
          </label>
        </div>

        <label className="block">
          <span className="field-label">Label above the name</span>
          <input name="nameLabel" className="input" maxLength={24} placeholder={values.organizationName || "AI engineer"} value={values.nameLabel} onChange={set("nameLabel")} />
          <p className="field-hint">Defaults to the business name.</p>
          {err("nameLabel")}
        </label>

        <div className="grid gap-5 sm:grid-cols-3">
          <label className="block">
            <span className="field-label">Text next to the logo</span>
            <input name="logoText" className="input" maxLength={20} value={values.logoText} onChange={set("logoText")} />
            {err("logoText")}
          </label>
          <label className="block">
            <span className="field-label">Top right label</span>
            <input name="headerLabel" className="input" maxLength={12} placeholder="ROME" value={values.headerLabel} onChange={set("headerLabel")} />
            {err("headerLabel")}
          </label>
          <label className="block">
            <span className="field-label">Top right value</span>
            <input name="headerValue" className="input" maxLength={20} placeholder="DevFest" value={values.headerValue} onChange={set("headerValue")} />
            {err("headerValue")}
          </label>
        </div>

        <div className="space-y-3">
          {TOGGLES.map(([key, label, hint]) => (
            <label key={key} className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                name={key}
                className="mt-1"
                checked={values[key]}
                onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.checked }))}
              />
              <span>
                <span className="font-medium">{label}</span>
                <span className="block text-muted">{hint}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-4">
          {(["bgColor", "fgColor", "labelColor"] as const).map((key) => (
            <label key={key} className="block">
              <span className="field-label">{{ bgColor: "Background", fgColor: "Text", labelColor: "Labels" }[key]}</span>
              <input name={key} type="color" className="h-10 w-full cursor-pointer rounded-lg border border-border bg-surface" value={values[key]} onChange={set(key)} />
            </label>
          ))}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Logo (wide, PNG/JPG/WebP)</span>
            <input name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="text-sm" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
            {existingLogoUrl && (
              <label className="mt-2 flex items-center gap-2 text-xs text-muted">
                <input type="checkbox" name="removeLogo" checked={removeLogo} onChange={(e) => setRemoveLogo(e.target.checked)} /> Remove current logo
              </label>
            )}
          </label>
          <label className="block">
            <span className="field-label">Icon (square)</span>
            <input name="icon" type="file" accept="image/png,image/jpeg,image/webp" className="text-sm" onChange={(e) => setIconFile(e.target.files?.[0] ?? null)} />
            <p className="field-hint">Shown on the lock-screen notification. A letter icon is generated if empty.</p>
          </label>
        </div>

        {state.error && <p className="text-sm text-danger">{state.error}</p>}
        {state.success && <p className="text-sm text-success">{state.success}</p>}
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <p className="mb-3 text-sm font-medium text-muted">Preview</p>
        <PassPreview
          {...values}
          message={latestMessage || values.welcomeText}
          glowHue={values.dayGlow ? glowHue : null}
          qrUrl={qrUrl}
          logoUrl={logoPreview ?? (removeLogo ? null : existingLogoUrl)}
          iconUrl={iconPreview ?? existingIconUrl}
        />
      </div>
    </form>
  );
}
