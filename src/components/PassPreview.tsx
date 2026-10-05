export interface PassPreviewProps {
  organizationName: string;
  name: string;
  message: string;
  bgColor: string;
  fgColor: string;
  labelColor: string;
  logoUrl?: string | null;
  iconUrl?: string | null;
  latestLabel?: string;
  barcode?: boolean;
  /** Real QR image when the card exists; a blank square stands in before it is saved. */
  qrUrl?: string | null;
  /** Day-glow hue (0 to 1) when the card has the glow strip. */
  glowHue?: number | null;
}

const hsl = (hue: number) => `hsl(${Math.round((((hue % 1) + 1) % 1) * 360)} 75% 66%)`;

/** CSS version of the strip in src/lib/glow/strip.ts. */
function glowBackground(hue: number, bg: string): string {
  return [
    `linear-gradient(to bottom, transparent 45%, ${bg})`,
    `radial-gradient(50% 150% at 13% -15%, ${hsl(hue - 0.11)}, transparent)`,
    `radial-gradient(50% 150% at 53% -40%, ${hsl(hue)}, transparent)`,
    `radial-gradient(48% 150% at 90% -8%, ${hsl(hue + 0.06)}, transparent)`,
    bg,
  ].join(", ");
}

/** Approximation of how the pass looks in Apple Wallet. */
export function PassPreview(props: PassPreviewProps) {
  return (
    <div
      className="w-full max-w-sm overflow-hidden rounded-2xl p-5 shadow-lg"
      style={{ background: props.bgColor, color: props.fgColor }}
      aria-label="Pass preview"
    >
      <div className="flex h-10 items-center gap-3">
        {props.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={props.logoUrl} alt="" className="h-10 max-w-[60%] object-contain object-left" />
        ) : (
          <>
            {props.iconUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={props.iconUrl} alt="" className="h-8 w-8 rounded-md" />
            )}
            <span className="truncate font-semibold">{props.organizationName || "Your business"}</span>
          </>
        )}
      </div>
      {props.glowHue != null ? (
        <div
          className="-mx-5 mt-4 flex aspect-[375/123] flex-col justify-end px-5 pb-3"
          style={{ background: glowBackground(props.glowHue, props.bgColor) }}
        >
          <div className="text-2xl font-semibold">{props.name || "Card name"}</div>
        </div>
      ) : (
        <div className="mt-8 text-2xl font-semibold">{props.name || "Card name"}</div>
      )}
      <div className="mt-6">
        <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: props.labelColor }}>
          {props.latestLabel || "Latest"}
        </div>
        <div className="mt-1 text-sm leading-snug">{props.message || "You will receive updates here."}</div>
      </div>
      {props.barcode &&
        (props.qrUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={props.qrUrl} alt="QR code" className="mx-auto mt-6 h-24 w-24 rounded-md bg-white p-1.5" />
        ) : (
          <div className="mx-auto mt-6 h-24 w-24 rounded-md bg-white" aria-label="QR code" />
        ))}
    </div>
  );
}
