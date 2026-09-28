"""Generate light/dark README illustrations for WalletCast."""
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "docs", "assets")
FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

THEMES = {
    "light": dict(bg="#FFFFFF", card="#F5F5F7", stroke="#E5E5EA", text="#1D1D1F", sub="#6E6E73",
                  field="#FFFFFF", chrome="#ECECEE", accent="#4F46E5", pill="#000000", pilltext="#FFFFFF",
                  notif="#FFFFFF", faint="#D1D1D6"),
    "dark": dict(bg="#0D1117", card="#1C1C1E", stroke="#2C2C2E", text="#F5F5F7", sub="#98989D",
                 field="#2C2C2E", chrome="#161618", accent="#818CF8", pill="#FFFFFF", pilltext="#000000",
                 notif="#2C2C2E", faint="#3A3A3C"),
}


def qr(x, y, size, color):
    """Decorative QR-like block (not scannable)."""
    cell = size / 21
    pattern = [
        "111111101011001111111", "100000100110101000001", "101110101001001011101",
        "101110100111101011101", "101110101100001011101", "100000101010101000001",
        "111111101010101111111", "000000001101000000000", "110101110011101101011",
        "010010001101010110100", "101101111000111010111", "011000010111001001010",
        "110111101001110110101", "000000001011010001011", "111111100110101101100",
        "100000101101011010011", "101110100011100111010", "101110101110011001101",
        "101110100101110110011", "100000101010001011100", "111111101100110101011",
    ]
    rects = []
    for r, row in enumerate(pattern):
        for c, v in enumerate(row):
            if v == "1":
                rects.append(f'<rect x="{x + c * cell:.1f}" y="{y + r * cell:.1f}" width="{cell + 0.3:.1f}" height="{cell + 0.3:.1f}" fill="{color}"/>')
    return "".join(rects)


def steps(t):
    w, h = 1200, 420
    cw, gap = 368, 48
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" font-family="{FONT}">',
             f'<rect width="{w}" height="{h}" fill="{t["bg"]}"/>']
    items = [
        ("1", "Scan", "Customers scan your QR code", "at the counter, on a flyer or a receipt."),
        ("2", "Add to Wallet", "One tap. No app to install,", "no account to create."),
        ("3", "Notify", "Your message lands on their", "lock screen. Every time."),
    ]
    for i, (n, title, l1, l2) in enumerate(items):
        x = i * (cw + gap) + 8
        parts.append(f'<rect x="{x}" y="8" width="{cw}" height="{h - 16}" rx="28" fill="{t["card"]}"/>')
        cx = x + cw / 2
        # illustration area 8..250
        if i == 0:
            parts.append(f'<rect x="{cx - 80}" y="48" width="160" height="160" rx="22" fill="#FFFFFF" stroke="{t["stroke"]}"/>')
            parts.append(qr(cx - 60, 68, 120, "#1D1D1F"))
        elif i == 1:
            parts.append(f'<rect x="{cx - 120}" y="52" width="240" height="96" rx="16" fill="#111827"/>')
            parts.append(f'<text x="{cx - 100}" y="84" font-size="13" font-weight="600" fill="#FFFFFF">Lu\'s Café</text>')
            parts.append(f'<text x="{cx - 100}" y="110" font-size="9.5" font-weight="600" fill="#9CA3AF" letter-spacing="0.8">LATEST</text>')
            parts.append(f'<text x="{cx - 100}" y="128" font-size="12" fill="#FFFFFF">Thanks for adding our card!</text>')
            parts.append(f'<rect x="{cx - 104}" y="168" width="208" height="44" rx="12" fill="{t["pill"]}"/>')
            parts.append(f'<text x="{cx}" y="196" font-size="14.5" font-weight="600" fill="{t["pilltext"]}" text-anchor="middle">Add to Apple Wallet</text>')
        else:
            parts.append(f'<rect x="{cx - 136}" y="96" width="272" height="80" rx="20" fill="{t["notif"]}" stroke="{t["stroke"]}"/>')
            parts.append(f'<rect x="{cx - 122}" y="110" width="34" height="34" rx="8" fill="#111827"/>')
            parts.append(f'<text x="{cx - 105}" y="133" font-size="16" font-weight="700" fill="#FFFFFF" text-anchor="middle">L</text>')
            parts.append(f'<text x="{cx - 78}" y="124" font-size="13.5" font-weight="600" fill="{t["text"]}">Lu\'s Café</text>')
            parts.append(f'<text x="{cx + 124}" y="124" font-size="11.5" fill="{t["sub"]}" text-anchor="end">now</text>')
            parts.append(f'<text x="{cx - 78}" y="143" font-size="13.5" fill="{t["text"]}">Flash sale: 2 croissants for 1</text>')
            parts.append(f'<text x="{cx - 78}" y="161" font-size="13.5" fill="{t["text"]}">until noon.</text>')
        parts.append(f'<circle cx="{x + 44}" cy="{h - 132}" r="15" fill="{t["accent"]}"/>')
        parts.append(f'<text x="{x + 44}" y="{h - 127}" font-size="15" font-weight="700" fill="#FFFFFF" text-anchor="middle">{n}</text>')
        parts.append(f'<text x="{x + 70}" y="{h - 124}" font-size="24" font-weight="700" fill="{t["text"]}" letter-spacing="-0.5">{title}</text>')
        parts.append(f'<text x="{x + 30}" y="{h - 82}" font-size="16" fill="{t["sub"]}">{l1}</text>')
        parts.append(f'<text x="{x + 30}" y="{h - 58}" font-size="16" fill="{t["sub"]}">{l2}</text>')
    parts.append("</svg>")
    return "\n".join(parts)


def dashboard(t):
    w, h = 1200, 680
    p = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" font-family="{FONT}">',
         f'<rect width="{w}" height="{h}" rx="16" fill="{t["bg"]}" stroke="{t["stroke"]}"/>',
         # window chrome
         f'<path d="M0 16 a16 16 0 0 1 16 -16 h{w - 32} a16 16 0 0 1 16 16 v28 h-{w} z" fill="{t["chrome"]}"/>',
         '<circle cx="24" cy="22" r="6" fill="#FF5F57"/><circle cx="44" cy="22" r="6" fill="#FEBC2E"/><circle cx="64" cy="22" r="6" fill="#28C840"/>',
         f'<rect x="440" y="10" width="320" height="24" rx="8" fill="{t["bg"]}"/>',
         f'<text x="600" y="27" font-size="12" fill="{t["sub"]}" text-anchor="middle">walletcast.yourdomain.com</text>',
         # nav
         f'<text x="40" y="84" font-size="15" font-weight="700" fill="{t["text"]}">WalletCast</text>',
         f'<text x="140" y="84" font-size="14" fill="{t["sub"]}">Cards</text>',
         f'<text x="196" y="84" font-size="14" fill="{t["sub"]}">Settings</text>',
         f'<line x1="0" y1="104" x2="{w}" y2="104" stroke="{t["stroke"]}"/>',
         f'<text x="40" y="146" font-size="13" fill="{t["sub"]}">Lu\'s Café</text>',
         f'<text x="40" y="176" font-size="26" font-weight="700" fill="{t["text"]}" letter-spacing="-0.5">Coffee Club</text>',
         f'<rect x="1020" y="150" width="140" height="36" rx="10" fill="{t["bg"]}" stroke="{t["stroke"]}"/>',
         f'<text x="1090" y="173" font-size="13" font-weight="500" fill="{t["text"]}" text-anchor="middle">Open public page ↗</text>',
         ]
    # send panel
    p += [f'<rect x="40" y="206" width="700" height="290" rx="18" fill="{t["card"]}"/>',
          f'<text x="68" y="244" font-size="17" font-weight="700" fill="{t["text"]}">Send a notification</text>',
          f'<text x="68" y="266" font-size="13" fill="{t["sub"]}">Appears on the lock screen of everyone who has the card.</text>',
          f'<rect x="68" y="284" width="644" height="40" rx="10" fill="{t["field"]}" stroke="{t["stroke"]}"/>',
          f'<text x="84" y="309" font-size="14" fill="{t["text"]}">Flash sale</text>',
          f'<rect x="68" y="336" width="644" height="84" rx="10" fill="{t["field"]}" stroke="{t["stroke"]}"/>',
          f'<text x="84" y="362" font-size="14" fill="{t["text"]}">2 croissants for 1 until noon. Show this card at the counter.</text>',
          f'<text x="68" y="464" font-size="12" fill="{t["sub"]}">61/300</text>',
          f'<rect x="580" y="440" width="132" height="38" rx="10" fill="{t["accent"]}"/>',
          f'<text x="646" y="464" font-size="14" font-weight="600" fill="#FFFFFF" text-anchor="middle">Send to 1,284</text>']
    # stats panel
    p += [f'<rect x="764" y="206" width="396" height="170" rx="18" fill="{t["card"]}"/>',
          f'<text x="792" y="244" font-size="13" font-weight="600" fill="{t["sub"]}" letter-spacing="0.4">SUBSCRIBERS</text>',
          f'<text x="792" y="300" font-size="48" font-weight="700" fill="{t["text"]}" letter-spacing="-1.5">1,284</text>',
          f'<rect x="792" y="322" width="340" height="8" rx="4" fill="{t["faint"]}"/>',
          f'<rect x="792" y="322" width="242" height="8" rx="4" fill="{t["accent"]}"/>',
          f'<text x="792" y="354" font-size="13" fill="{t["sub"]}">912 Apple Wallet · 372 Google Wallet</text>']
    # history
    p += [f'<rect x="764" y="392" width="396" height="248" rx="18" fill="{t["card"]}"/>',
          f'<text x="792" y="430" font-size="13" font-weight="600" fill="{t["sub"]}" letter-spacing="0.4">HISTORY</text>']
    hist = [("Happy hour starts now", "Today, 5:02 PM"), ("New autumn menu is here", "Mon, 9:15 AM"), ("Closed for the holiday", "Sep 30, 8:00 AM")]
    for i, (msg, when) in enumerate(hist):
        y = 462 + i * 58
        p += [f'<text x="792" y="{y}" font-size="14" font-weight="600" fill="{t["text"]}">{msg}</text>',
              f'<text x="1132" y="{y}" font-size="12" fill="{t["sub"]}" text-anchor="end">{when}</text>',
              f'<text x="792" y="{y + 20}" font-size="12" fill="{t["sub"]}">Apple 912/912 · Google 372/372</text>']
        if i < 2:
            p.append(f'<line x1="792" y1="{y + 36}" x2="1132" y2="{y + 36}" stroke="{t["stroke"]}"/>')
    # pass preview
    p += [f'<rect x="40" y="512" width="700" height="128" rx="18" fill="{t["card"]}"/>',
          '<rect x="68" y="532" width="260" height="88" rx="14" fill="#111827"/>',
          '<text x="86" y="558" font-size="12" font-weight="600" fill="#FFFFFF">Lu\'s Café</text>',
          '<text x="86" y="582" font-size="9" font-weight="600" fill="#9CA3AF" letter-spacing="0.8">LATEST</text>',
          '<text x="86" y="600" font-size="11.5" fill="#FFFFFF">Flash sale: 2 croissants for 1</text>',
          f'<text x="356" y="566" font-size="15" font-weight="600" fill="{t["text"]}">Live preview</text>',
          f'<text x="356" y="590" font-size="13" fill="{t["sub"]}">Colours, logo and texts update as you type.</text>',
          "</svg>"]
    return "\n".join(p)


for name, t in THEMES.items():
    with open(os.path.join(OUT, f"how-it-works-{name}.svg"), "w") as f:
        f.write(steps(t))
    with open(os.path.join(OUT, f"dashboard-{name}.svg"), "w") as f:
        f.write(dashboard(t))
print("ok")
