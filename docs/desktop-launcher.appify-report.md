## Appify report

**1. Project type detected:**
Vite + React app, npm lockfile, existing appify desktop launcher, no existing Electron/Tauri config, no FSA usage, `swiftc` available, canonical checkout at `/Users/christiankatzmann/Dev/ïdea.com/modelarena`.

**1.5. Name resolution** *(if multiple naming sources disagreed)*
Picked: "ïdea Bench". Sources surveyed: folder `modelarena`, `package.json` name `idea-bench`, recent commits naming "ïdea Bench", existing appify config. Reason: recent commits and launcher config already use the user-facing product name. To override: edit `scripts/appify.config.json`, then `npm run desktop:build && npm run desktop:install`.

**2. Apps detected:** 1
- **ïdea Bench** — single-server Vite + React dev app, preferred port `3000`, start command `npx vite --port $PORT --host 0.0.0.0`.

**3. Strategy chosen per app:**
- ïdea Bench: A1 native — Swift WebKit shell.

**4. Why these are the lowest-effort robust approaches:**
The app already had the appify A1 native launcher, which is still the right fit: it preserves the app's own Dock icon, supports single-instance activation, and keeps the dev server warm after window close. Chrome fallback was not needed because no Chromium-only browser APIs or FSA real-I/O were detected. This session refreshed the visual identity assets instead of changing the launcher architecture.

**5. Files added/changed:**
- `assets/app-icon.png`
- `assets/brand/idea-mark.png`
- `assets/brand/idea-identity-light.png`
- `assets/brand/idea-identity-dark.png`
- `public/logo-brand.png`
- `public/favicon.png`, `public/favicon-light.png`, `public/apple-touch-icon.png`
- `desktop/ïdea Bench.app/...` regenerated
- `assets/icons/idea-bench/...` regenerated
- `src/components/ui/brand-mark.tsx`
- `src/index.css`
- `src/components/models/ModelAvailabilityToggle.tsx`
- `index.html`, `public/login.html`
- `docs/design-system/DESIGN-SYSTEM.md`
- `docs/desktop-launcher.md`, `docs/desktop-launcher.appify-report.md`

**6. Icon source per app:**
- ïdea Bench: `/Users/christiankatzmann/Downloads/ChatGPT Image May 30, 2026, 02_11_00 PM (1).png` — 1254×1254 brand board. Used the largest clean primary mark crop, then composed a flat 1024×1024 off-white square icon source so macOS supplies the app-icon shape only once. Considered: existing slash icon in `assets/app-icon.png` (rejected: old identity), dark board `/Users/christiankatzmann/Downloads/da7d046a-b24a-4da7-9e65-8be040147067.png` (kept as reference, not Dock icon because user requested the white-background icon).

**7. To change an app icon later:**
Replace `assets/app-icon.png`, then `npm run desktop:icons && npm run desktop:build && npm run desktop:install`. The install step refreshes the Dock and Finder icon caches automatically.

**8. Build / install / quit commands:**
- Build: `npm run desktop:build`
- Install: `npm run desktop:install` (→ `~/Desktop/MyApps/`)
- Quit: `npm run desktop:quit` (stops daemonized servers)

**9. Generated launcher locations:**
- Repo: `desktop/ïdea Bench.app`
- Installed: `~/Desktop/MyApps/ïdea Bench.app`
- Runtime port (after first click): `~/Library/Logs/ïdea Bench/server.port`

**10. Verification (per app):**
- [x] Build succeeded; `.app` exists; wrapper is universal Mach-O; `.icns` is multi-resolution
- [x] Bundle metadata correct (no `__PLACEHOLDER__` leakage)
- [x] Cold launch: `server.port` recorded; HTTP responds on runtime port `3000`
- [x] Single instance; `lsappinfo` confirms bundle id
- [x] Cmd+Q (via osascript) kills server tree
- [x] Red-X leaves server warm
- [x] Warm re-launch responds in ~109ms (descendant-walk reattach works)
- [x] Install-path open exits 0; `lsregister` shows exactly one entry
- [x] Browser preview: login page renders the split-sphere brand mark cleanly on desktop and mobile
- [ ] needs human: actual WebKit window content and Dock icon identity
- [ ] deferred — env hostile: n/a

**11. Dock Stack:**
- [x] `~/Desktop/MyApps/` exists
- [ ] User has dragged `~/Desktop/MyApps/` to the right side of the Dock (one-time setup; already expected for this workspace, but not programmatically verified)

**12. Known limitations:**
- Unsigned bundle — Gatekeeper warns on first launch.
- WebKit, not Chromium — open the runtime URL in a regular browser for Chromium devtools.
- Baked `PROJECT_ROOT` — re-run `npm run desktop:build && npm run desktop:install` if the repo moves.
- Source board is a 1254px generated image, so the extracted mark is a careful high-res derivative rather than original vector art.
- Universal arm64+x86_64 wrapper binary.

## Decision history
- 2026-05-30: Brand asset refresh (Strategy A1 native, bundle-id `com.user.idea-bench`, port `3000`, icon source: white idea.com identity board crop composed into a flat square `assets/app-icon.png`).
