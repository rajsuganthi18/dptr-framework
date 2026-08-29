DPTR — Defect‑Preserving Test Repair prototype, CI, and pilot experiment

Abstract

We implement DPTR, a prototype that attempts to repair broken Playwright locators while preserving real defects. DPTR combines DOM structural deltas, pixel‑level visual diffs (pngjs + pixelmatch), and runtime invariants to decide whether to HEAL a broken locator or REJECT a real defect. We provide a CLI experiment runner that emits forensic artifacts per case and aggregated metrics.

Current pilot (small, synthetic) produced these summary numbers (see `experiment-summary.json`):

- Raw cases: 12
- FHR (False Healing Rate): NO_HEAL=0.5, HEURISTIC=0.5, DPTR=0.5
- DPR (Defect Preservation Rate): NO_HEAL=0.5, HEURISTIC=0.5, DPTR=0.5
- Precision: NO_HEAL=0.5, HEURISTIC=1.0, DPTR=0.5

These numbers are illustrative; the repository includes tools to scale experiments and reproduce results.

Introduction

... (expand for full paper) ...

Methods

See `src/experiments/experiment-runner.ts` for the exact protocol. In short: for each target case we capture a baseline context, apply a mutation (or load a mutated page), and run the test under three engines: `NO_HEAL`, `HEURISTIC`, and `DPTR`. For each run we record PASS/FAIL, DPTR decision, domDistance, visualSimilarity, invariant status, and save baseline/mutated screenshots plus candidate diffs.

Pilot Results

The current pilot used built-in synthetic mutations (ID rename, text change, overlay block, handler removed). The summary above is saved in `experiment-summary.json`.

Discussion

- Strengths: auditability, conservative defaults, multi‑modal signals.  
- Limitations: small synthetic corpus, visual sensitivity, coarse template-matching for canvas.

How to reproduce and scale

1. Prepare a `targets.json` with target cases (see `experiments/targets.sample.json`).
2. Run the runner: `node dist/src/experiments/experiment-runner.js --targets experiments/targets.json --runs 100 --retries 2 --outdir ./dptr-experiments`.
3. After completion run analysis: `node dist/src/experiments/analyze-results.js` inside the outdir.
4. Generate plots: `python3 scripts/plot_results.py ./dptr-experiments/experiment-results.csv ./dptr-experiments/plots`.

Forensic artifacts and reproducibility

When you run experiments, the runner produces per-case directories with screenshots and per-engine JSON — include these with any submission for transparency.

Next steps

- Scale to N≥100 per engine and per mutation class.  
- Replace grid-matching with faster hierarchical matching for canvas cases.  
- Train a small calibrated classifier to tune the heal/reject threshold for target DPR.

---

This draft is a starting point — tell me where to expand (Related Work, Experiments, Figures).
