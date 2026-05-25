# Reproduce The Rating Proof

ïdea Bench's central quantitative claim is that pairwise votes become a defensible Bradley-Terry ranking with confidence intervals. This is the smallest deterministic proof of that claim.

## Inputs

```text
478dc96b049241013caf3422e03906b99e9ad4190a7ff1ae59414f53895ec2bb  src/server/bradley-terry.ts
8269e64d6c5579c77208bc3bbe4b1d2bf9faec69fde8a56dbcc8cafa1afadf9b  src/server/__tests__/bradley-terry.test.ts
```

## Command

```bash
npm install
npm run test:run -- src/server/__tests__/bradley-terry.test.ts
```

## Expected Result

The targeted Vitest file should pass. It verifies that:

- a connected comparison graph ranks stronger models above weaker ones;
- unseen models remain neutral at rating `1000` with no confidence interval;
- ties and `both_bad` outcomes become symmetric half-wins;
- the matrix inversion helper returns a real inverse or `null` for singular input.

Last reproduced: 2026-05-25 on macOS with Node.js `v22.22.0` and npm `10.9.4`.
