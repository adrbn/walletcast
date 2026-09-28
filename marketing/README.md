# Marketing

Promo videos and the scripts that generate them.

| File | Format | Use |
|---|---|---|
| `videos/walletcast-promo-4x5.mp4` | 1080×1350, 60 fps, 18 s | Reddit, Threads, X (mobile feeds) |
| `videos/walletcast-promo-16x9.mp4` | 1920×1080, 60 fps, 18 s | README, landscape players |

## Re-render

Requires `ffmpeg` and the repo's dependencies (`pnpm install`, for `sharp`).

```bash
node marketing/video-src/promo-4x5.mjs        # full render → marketing/videos/
node marketing/video-src/promo-16x9.mjs
node marketing/video-src/promo-4x5.mjs 9.3    # single frame preview → $TMPDIR/walletcast-preview-9.3.png
```

Every frame is an SVG rendered by `sharp`, then encoded with x264. Motion uses Apple-style springs (damping ratio + response).

`assets-src/readme-illustrations.py` regenerates the light/dark SVGs in `docs/assets/`.
