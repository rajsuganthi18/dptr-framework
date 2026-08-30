# Contributing

This repository is a research prototype and should remain focused, conservative, and evidence-driven.

## Project goals

- preserve the defect-aware research direction
- avoid scope drift into generic game AI, analytics, or unrelated testing domains
- keep implementation and claims aligned with observed evidence

## Development expectations

1. Prefer small, readable changes.
2. Validate with the smallest relevant command before claiming success.
3. Keep documentation aligned with actual behavior.
4. Avoid broad over-claiming when evidence is limited.
5. Preserve the principle that defect signals should not be masked by a repair.

## Validation

Use the project verification workflow:

```bash
npm install
npx playwright install chromium
npm run build
npm run test:demo
```

## Submission guidance

- Keep changes focused on the DPTR repair engine, invariants, or evidence quality.
- Update the README and evidence files when scope or maturity changes.
- Do not add unrelated artifacts or exploratory experiments without a clear justification.
