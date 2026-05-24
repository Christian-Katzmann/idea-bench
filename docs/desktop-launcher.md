# Desktop launcher

Click an icon in `~/Desktop/MyApps/` (or its Dock Stack) to launch.

## First launch

1. Right-click the app icon and choose **Open**, then click **Open** in the dialog. macOS remembers and skips this on subsequent launches (Gatekeeper, unsigned bundle).
2. The first cold start takes 5–15 s while Vite compiles.
3. If a "couldn't be opened" alert appears citing the dev server, open `~/Library/Logs/ïdea Bench/server.log`. The alert quotes the tail; the full log usually shows the cause.

## App

- **ïdea Bench** (`ïdea Bench.app`) — Vite + React dev server. Preferred port `:3000`; falls back to the first free port in `[3000–3050]` when sibling apps occupy `:3000`.

The `.app` runs as a real macOS app with its own Dock icon and its own window — **not** a Chrome `--app` window. It embeds a small Swift WebKit shell so the Dock icon stays ours and macOS handles single-instance activation natively.

## Launch behavior

The launcher is **persistent** — designed for daily use, not single-shot demos.

- **First click after boot:** ~3–8 s for Vite cold start.
- **Closing the window with the red X does NOT kill the dev server.** It stays warm. Click the icon again and the window opens within ~250 ms.
- **Cmd+Q (or right-click → Quit in the Dock) DOES kill the server.** Full-shutdown path — use when you actually want everything to stop.
- **Re-clicking the icon while the window is open** brings the existing window forward. No second window.
- **Sibling appified apps coexist.** Ten of your appified apps configure `:3000` as their preferred port. This launcher scans upward and picks the first free port at click time. The actual runtime port is recorded at `~/Library/Logs/ïdea Bench/server.port`.

To stop the persistent dev server from the terminal:

```bash
npm run desktop:quit
```

Reboot also works.

## Install / update

```bash
npm run desktop:build    # rebuild .app under desktop/
npm run desktop:install  # copy it into ~/Desktop/MyApps/, refresh Dock
```

The `~/Desktop/MyApps/` folder is meant to live as a Dock Stack — drag it to the right side of the Dock once and every appified app shows up there automatically.

## Replace the app icon

Replace the source PNG (square, ≥ 1024×1024 ideal):

- `assets/app-icon.png` (currently 1000×1000)

Then:

```bash
npm run desktop:icons    # regenerate icns
npm run desktop:build
npm run desktop:install
```

If the Dock briefly shows a stale thumbnail after a reboot, drag the Stack out and back in to force-rebuild — the install step's automatic Dock refresh covers everything else.

## Logs & runtime files

Under `~/Library/Logs/ïdea Bench/`:
- `server.log` — Vite output. If startup fails, an alert quotes the tail.
- `server.port` — the actual runtime port (may differ from `3000` if collision-fallback kicked in).
- `server.pid` — supervisor PID. The launcher's reattach gate walks this PID's descendant tree, so warm re-launch works.

## Architecture

```
desktop/ïdea Bench.app/
  Contents/
    Info.plist                       # CFBundleIdentifier = com.user.idea-bench
    MacOS/
      run                            # bash launcher (vite boot + exec)
      wrapper                        # compiled Swift WKWebView shell (universal)
    Resources/
      AppIcon.icns                   # generated from assets/app-icon.png
```

`PROJECT_ROOT` is **baked at build time** so the bundle keeps working after it's copied to `~/Desktop/MyApps/`. Re-run `npm run desktop:build` if the repo ever moves.

The dev-server invocation (`scripts/appify.config.json`) is `npx vite --port "$PORT" --host 0.0.0.0`. This bypasses `npm run dev` deliberately — that script hardcodes `--port=3000`, which would silently override the launcher's chosen port and cause sibling-app collisions.

## Known limitations

- **Unsigned bundle.** First launch triggers Gatekeeper. Right-click → Open once and macOS remembers.
- **Repo path is baked in.** Moving the repo means re-running `npm run desktop:build && npm run desktop:install`.
- **Persistent server.** Closing the window leaves Vite running. That's intentional — it's why the second launch is fast — but it means `lsof -i :3000-3050` keeps showing the binding until you Cmd+Q the app, run `npm run desktop:quit`, or reboot.
- **WebKit, not Chromium.** If you need Chrome devtools, point a regular browser tab at the runtime URL (read it from `~/Library/Logs/ïdea Bench/server.port`).
- **Distribution to other users not supported.** Unsigned, no notarization, no auto-update. Your other Mac counts (universal arm64+x86_64 binary).
