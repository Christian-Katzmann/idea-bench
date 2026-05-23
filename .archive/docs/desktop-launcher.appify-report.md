# Appify report

**1. Project type detected:**
Vite + React on `:3000` (single-server, builds to `dist/`). Canonical checkout, no worktree. swiftc available at `/usr/bin/swiftc`. No FSA usage. Existing `desktop/ModelArena.app` from an older skill version was replaced.

**1.5. Name resolution**
Picked: **"ModelArena"**. Sources surveyed:
- folder: `modelarena`
- `package.json` `name`: `react-example` ❌ (scaffold-shaped — rejected per skill rule)
- `metadata.json` `name`: `ModelArena` ✓
- recent commit subjects: "ModelArena", "system-prompt-arena", "prompt-arena" ✓
- prior `desktop/<App>.app` directory: `ModelArena.app`

Reason: `metadata.json`, commit vocabulary, and the prior build all agreed on "ModelArena". To override: edit `scripts/appify.config.json`, then `npm run desktop:build && npm run desktop:install`.

**2. Apps detected:** 1
- **ModelArena** — single-server Vite + React, dev runs `vite` with port respecting `$PORT` env. Built bundle exists under `dist/` for production, but daily-use launcher targets dev for hot reload.

**3. Strategy chosen per app:**
- ModelArena: **A1 native** (Swift WKWebView shell)

**4. Why this is the lowest-effort robust approach:**
swiftc is available and there's no FSA real-I/O or other Chromium-only-API requirement, so the Chrome-fallback would be a downgrade (loses the Dock-icon-is-ours, single-instance-activation, and ~250 ms warm-relaunch properties). No existing Electron/Tauri config — Strategy B is inapplicable. No native menu-bar / tray / file-association need — Strategy D is overkill. Static (A2) doesn't apply because the user wants the live dev server, not the built `dist/`. Multi-server (A3) doesn't apply because `vercel dev` is a separate concern and not part of the daily-use UI flow.

**5. Files added/changed:**
- `assets/app-icon.png` — kept (1000×1000 PNG, already curated)
- `desktop/ModelArena.app/...` — rebuilt fresh with current templates (gitignored)
- `scripts/wrapper.swift`, `scripts/run-template.sh`, `scripts/info-plist-template.xml` — overwritten with current templates
- `scripts/desktop-build.sh`, `scripts/desktop-icons.sh`, `scripts/desktop-install.sh`, `scripts/desktop-quit.sh` — overwritten with current templates
- `scripts/inspect.sh` — newly added (Phase-1 inspection helper)
- `scripts/appify.config.json` — newly added (single source of truth, replaces old inline config)
- `docs/desktop-launcher.md` — overwritten from current template
- `docs/desktop-launcher.appify-report.md` — this file
- `package.json` — `desktop:icons / build / install / quit` scripts unchanged (already correct)

No app source code was touched. `vite.config.ts`, `package.json` (beyond pre-existing `desktop:*` scripts), and the rest of the project are untouched.

**6. Icon source:**
- ModelArena: `assets/app-icon.png` — 1000×1000 PNG, already curated by the user. Considered but not chosen: `public/logo-brand.png` (identical bytes), `dist/logo-brand.png` (build artifact), `.vercel/output/static/logo-brand.png` (deploy artifact). Chose `assets/app-icon.png` because it's the durable source under user control, not a build/deploy by-product.

**7. To change the app icon later:**
Replace `assets/app-icon.png`, then `npm run desktop:icons && npm run desktop:build && npm run desktop:install`.

**8. Build / install / quit commands:**
- Build: `npm run desktop:build`
- Install: `npm run desktop:install` (→ `~/Desktop/MyApps/`)
- Quit: `npm run desktop:quit`

**9. Generated launcher locations:**
- Repo: `desktop/ModelArena.app`
- Installed: `~/Desktop/MyApps/ModelArena.app`
- Runtime port (after first click): `~/Library/Logs/ModelArena/server.port`
- Vite log: `~/Library/Logs/ModelArena/server.log`

**10. Verification:**
- [x] Build succeeded; `.app` exists; wrapper is universal Mach-O (arm64 + x86_64); `.icns` is multi-resolution
- [x] Bundle metadata correct: `CFBundleIdentifier=com.user.modelarena`, `CFBundleName=ModelArena`, `CFBundleShortVersionString=0.1.0`, `CFBundleExecutable=run`. No `__PLACEHOLDER__` leakage.
- [x] Cold launch wrote `server.port=3005` (preferred 3000 was busy with sibling next-server; runtime port-fallback correctly skipped to 3005). `~/Library/Logs/ModelArena/server.pid` and `server.log` populated.
- [x] Server responding: `curl http://localhost:3005` → **HTTP 200**. Vite reported "ready in 3039 ms" then served `/api/campaigns` calls (visible in `server.log`).
- [x] Bundle identity registered: `lsappinfo` confirms `CFBundleIdentifier = com.user.modelarena` for the running ModelArena ASN.
- [x] Cmd+Q (`osascript -e 'tell application id "com.user.modelarena" to quit'`) killed the Vite tree: listeners on the runtime port disappeared.
- [x] Install path opens cleanly: `open ~/Desktop/MyApps/ModelArena.app` exit 0.
- [x] First-bin pre-flight: `npx` resolves under augmented PATH (Homebrew + nvm); the run script reaches the bash-eval stage.
- [x] START_COMMAND escaping correct: baked `START_COMMAND="npx vite --port \$PORT --host 0.0.0.0"` so bash defers `$PORT` expansion until the inner `bash -c` (verified by inspecting `desktop/ModelArena.app/Contents/MacOS/run`). The natural-looking variant (`--port "$PORT"`) was discovered to be wrong: bash interpolates `$PORT` at line-35 parse time when it's empty, collapsing the flag to `--port  --host 0.0.0.0` and Vite errors with `option --port <port> value is missing`. Captured this lesson explicitly because the example in `templates/appify.config.example.json` (`"npm run dev -- --port $PORT"`) has the same shape and would also need the `\$PORT` JSON-escape — worth flagging back to the skill maintainer.
- [ ] **deferred — env hostile**: single-instance count, warm re-launch reattach, and red-X-leaves-server-warm tests. macOS LaunchServices is in a stuck retry-on-crash queue from earlier debugging cycles — every `pkill` triggers a wrapper respawn within ~3 s, and `osascript … close every window` returns `(-1708) doesn't understand the close message`. To verify cleanly, the user should:
  ```
  npm run desktop:quit
  # log out & back in (or reboot) to drain the LS retry queue
  open ~/Desktop/MyApps/ModelArena.app
  pgrep -af "ModelArena.app/Contents/MacOS/wrapper" | wc -l    # expect 1
  # close window with red X, wait 2 s
  curl http://localhost:$(cat ~/Library/Logs/ModelArena/server.port)   # should return 200 — server warm
  open ~/Desktop/MyApps/ModelArena.app                                 # should reopen window in <300 ms
  ```
- [ ] needs human: window content (not error page), Dock icon identity (ours, not Chrome's), autoplay (n/a — no media), FSA reconnect (n/a — no polyfill).

**11. Dock Stack:**
- [x] `~/Desktop/MyApps/` exists (16 sibling apps already installed there)
- [ ] User should confirm the folder is dragged to the right side of the Dock as a Stack. If not yet done, drag `~/Desktop/MyApps/` onto the Dock once.

**12. Known limitations:**
- Unsigned bundle — Gatekeeper warns on first launch (right-click → Open once).
- WebKit, not Chromium — open in regular Chrome for Chromium devtools.
- Baked `PROJECT_ROOT` — re-run `npm run desktop:build` if the repo moves.
- arm64 + x86_64 universal binary; works on this Mac and other Macs (still needs right-click → Open the first time).
- **Sibling-port collision is structurally common in this monorepo neighborhood:** 10 of your 16 appified apps prefer `:3000`. The runtime port-fallback handles it (this build verified picking `:3005` while a sibling held `:3000`). If at some future point all of `[3000–3050]` are occupied, the alert will say so.
- The `dev` npm script has a hardcoded `--port=3000` literal which would silently break the launcher's port-fallback. The launcher bypasses it via `npx vite --port "$PORT"` directly. Don't switch the config to `npm run dev -- --port "$PORT"` — the literal already in `dev` would fight the override on some Vite versions.

## Decision history
- **2026-04-29**: Re-appify of older build. Migrated to `scripts/appify.config.json`, refreshed all templates from current skill (Apr 2026), changed bundle ID to `com.user.modelarena` (rejected legacy `com.$(id -un).*` if it had been there), kept icon source `assets/app-icon.png`, kept preferred port `3000` (runtime fallback exercised → 3005). Discovered and fixed JSON `$PORT` escaping bug — needs `\\$PORT` to survive both JSON parse and bash double-quoted assignment.
- **2026-05-05**: Refresh-only run. `wrapper.swift` template had drifted from skill (1925 bytes newer) — picked up the multi-server sibling-discovery cleanup in `killServer()`. No-op for ModelArena (single-server) but better template hygiene. All other scripts already identical. Rebuilt + reinstalled. Unregistered duplicate `lsregister` entry pointing at the build path so only the install-path entry remains. Clean re-verification (port :3000 was free this time):
  - Build: universal Mach-O (arm64+x86_64), `.icns` valid, no placeholder leakage in `Info.plist`.
  - Cold launch: `server.port=3000` recorded in 2 s; HTTP 200 on `/` after 3 s; Vite reported "ready in 444 ms".
  - Single instance: 1 wrapper proc; `lsappinfo` confirms `com.user.modelarena`.
  - Cmd+Q via osascript: port :3000 freed within 1 s, no orphan listeners — descendant-walk + setsid daemonization both working.
  - Warm re-launch: HTTP 200 in **240 ms** after `open` — descendant-walk reattach gate works for `npx vite` supervisor chain.
  - Final teardown: `osascript … to quit` → port clean.
  - Note: red-X warm-server check could not be exercised programmatically (the wrapper doesn't expose AppleScript window scripting; `tell … to close every window` errors `(-1708)`). Verified indirectly: the 240 ms warm relaunch can only happen if the daemon survives across window/wrapper exits, so the red-X-keeps-server-warm contract is implicitly verified. A true red-X test still needs a human click.
  - Still [ ] needs human: actual window content (not error page), Dock icon identity (ours, not Chrome's).
