import fs from 'fs';
import path from 'path';

async function analyze() {
  const p = path.join(process.cwd(), 'experiment-results.json');
  if (!fs.existsSync(p)) {
    console.error('No results found at', p);
    process.exit(1);
  }
  const raw = JSON.parse(await fs.promises.readFile(p, 'utf8')) as any[];
  const byEngine: Record<string, any[]> = {};
  for (const r of raw) {
    byEngine[r.engine] = byEngine[r.engine] || [];
    byEngine[r.engine].push(r);
  }

  // Compute simple metrics: for BUG mutations, compute False Healing Rate (FHR)
  const bugs = raw.filter((x) => x.mutationCategory === 'BUG');
  const fhr: Record<string, number> = {};
  for (const engine of Object.keys(byEngine)) {
    const runs = byEngine[engine].filter((x) => x.mutationCategory === 'BUG');
    const falseHeals = runs.filter((x) => x.outcome === 'PASS').length;
    fhr[engine] = runs.length === 0 ? 0 : falseHeals / runs.length;
  }

  // Defect Preservation Rate (DPR) = 1 - FHR for BUGs
  const dpr: Record<string, number> = {};
  for (const k of Object.keys(fhr)) dpr[k] = 1 - fhr[k];

  // Repair precision on UI_UPDATE (how many UI updates resulted in PASS per engine)
  const updates = raw.filter((x) => x.mutationCategory === 'UI_UPDATE');
  const precision: Record<string, number> = {};
  for (const engine of Object.keys(byEngine)) {
    const runs = byEngine[engine].filter((x) => x.mutationCategory === 'UI_UPDATE');
    const passes = runs.filter((x) => x.outcome === 'PASS').length;
    precision[engine] = runs.length === 0 ? 0 : passes / runs.length;
  }

  const summary = { fhr, dpr, precision };
  const out = path.join(process.cwd(), 'experiment-summary.json');
  await fs.promises.writeFile(out, JSON.stringify({ summary, rawCounts: { total: raw.length } }, null, 2));
  console.log('Wrote summary to', out);
}

analyze().catch((e) => {
  console.error(e);
  process.exit(1);
});
