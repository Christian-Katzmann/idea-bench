# Producer Session Prompt

Produce a 30-second polished trailer for the repository using local rendering only.

Project root: `/Users/christiankatzmann/Dev/ïdea.com/modelarena`

Read first: `/Users/christiankatzmann/Dev/ïdea.com/modelarena/design/trailer/BRIEF.md`

Output target: `/Users/christiankatzmann/Dev/ïdea.com/modelarena/design/trailer/trailer.mp4`

Constraints:

- Frame 0 must show the product at full opacity. GitHub derives the README poster from the first MP4 frame.
- Use only real assets from `design/screenshots/` and `design/social/`.
- Keep runtime between 30 and 60 seconds.
- Do not use paid rendering, paid TTS, avatars, or cloud video services.
- Do not modify files outside `design/trailer/`.

When done, report:

1. Final MP4 path.
2. Runtime in seconds.
3. Confirmation that frame 0 shows the product at full opacity.
4. Verdict: `ready to embed` or `needs another pass: <reason>`.
