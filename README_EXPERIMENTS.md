DPTR Experiments — usage

1) Prepare targets

- Create a JSON file (see `experiments/targets.sample.json`) containing an array of cases. Each case may include `baselineHtml` / `mutatedHtml` for inline HTML, or `baselineUrl` / `mutatedUrl` for network targets. Include `selector` for the baseline locator to exercise.

2) Run experiments

```bash
node dist/src/experiments/experiment-runner.js --targets experiments/targets.json --runs 100 --retries 2 --outdir ./dptr-experiments
```

3) Analyze results

```bash
cd ./dptr-experiments
node ../dist/src/experiments/analyze-results.js
python3 ../scripts/plot_results.py ./experiment-results.csv ./plots
```

Notes
- Use local HTML clones or test instances for legal and reproducible runs. Do not run against third-party sites without permission.
- If you need help creating `targets.json` from a list of URLs, I can prepare a helper script to scaffold it.
