export interface PassPreviewProps {
  organizationName: string;
  name: string;
  message: string;
  bgColor: string;
  fgColor: string;
  labelColor: string;
  logoUrl?: string | null;
  iconUrl?: string | null;
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
      <div className="mt-8 text-2xl font-semibold">{props.name || "Card name"}</div>
      <div className="mt-6">
        <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: props.labelColor }}>
          Latest
        </div>
        <div className="mt-1 text-sm leading-snug">{props.message || "You will receive updates here."}</div>
      </div>
    </div>
  );
}
