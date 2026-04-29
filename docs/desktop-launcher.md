# Desktop launcher

Click an icon in `~/Desktop/MyApps/` (or its Dock Stack) to launch.

## Apps

- **ModelArena** (`ModelArena.app`) — Vite dev server on :3000, opens the operator console.

The `.app` runs as a real macOS app with its own Dock icon and its own window — **not** a Chrome `--app` window. It embeds a small Swift WebKit shell so the Dock icon stays ours and macOS handles single-instance activation natively.

## Launch behavior

The launcher is **persistent** — designed for daily use, not single-shot demos.

- **First click after boot:** 5–15 s. The dev server has to do a cold start (Vite prebundle).
- **Closing the window with the red X does NOT kill the dev server.** It stays warm in the background. Click the icon again and the window opens within ~250 ms.
- **Cmd+Q (or right-click → Quit in the Dock) DOES kill the server.** That's the full-shutdown path — use it when you actually want everything to stop.
- **Re-clicking the icon while the window is open** brings the existing window forward. No second window.

To stop the persistent dev server from the terminal:

```bash
/Users/christiankatzmann/Dev/ïdea.com/modelarena/scripts/desktop-quit.sh
# or, from the repo:
npm run desktop:quit
```

Reboot also works.

## Install / update

```bash
npm run desktop:build      # rebuild .app bundle(s) under desktop/
npm run desktop:install    # copy them into ~/Desktop/MyApps/
```

The `~/Desktop/MyApps/` folder is meant to live as a Dock Stack — drag it to the right side of the Dock once and every appified app shows up there automatically.

## Replace the app icon

Replace the source PNG (square, ≥ 1024×1024 ideal):

- ModelArena: `assets/app-icon.png` (currently a copy of `public/logo-brand.png`, 1000×1000)

Then:

```bash
npm run desktop:icons
npm run desktop:build
npm run desktop:install
```

If the Dock keeps caching an old icon after re-install:

```bash
killall Dock
```

## Architecture

```
desktop/ModelArena.app/
  Contents/
    Info.plist                       # CFBundleExecutable = "run"
    MacOS/
      run                            # bash launcher (server boot + exec)
      wrapper                        # compiled Swift WebKit shell
    Resources/
      AppIcon.icns                   # generated from assets/app-icon.png
```

`PROJECT_ROOT` is **baked at build time** so the bundle keeps working after it's copied to `~/Desktop/MyApps/`. Re-run `npm run desktop:build` if the repo ever moves.

## Logs

Dev-server output goes to `~/Library/Logs/ModelArena/server.log`. If startup fails, an alert dialog quotes the tail of that file and points at it.

## Known limitations

- **Unsigned bundle.** First launch triggers Gatekeeper ("can't be opened because the developer cannot be verified"). Right-click → Open once and macOS remembers the exception.
- **Repo path is baked in.** Moving the repo (the `ï` in `ïdea.com` is fine — non-ASCII paths are handled correctly) means re-running `npm run desktop:build && npm run desktop:install`.
- **Persistent server.** Closing the window leaves the dev server running. That's intentional — it's why the second launch is fast — but it means `lsof -i :3000` will keep showing bindings until you Cmd+Q the app, run `npm run desktop:quit`, or reboot.
- **WebKit, not Chromium.** The window uses Safari's WebKit engine. If you specifically need Chrome devtools or a Chromium-only feature, point a regular browser tab at `http://localhost:3000` — it's just localhost.
- **Single-developer use.** The `.app` bakes in your absolute repo path; it's not a redistributable bundle.
