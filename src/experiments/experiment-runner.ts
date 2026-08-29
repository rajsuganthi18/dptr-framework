import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { DPTRResolver } from '../dptr-engine';
import { tryHeuristicRepairAndRun } from '../heuristic-healer';

interface MutationCase {
  id: string;
  label: string;
  html: string;
  category: 'UI_UPDATE' | 'BUG';
}

const baselineHtml = `
<html>
  <body style="font-family: Arial; padding: 20px;">
    <button id="submit-btn" class="primary" style="padding:10px 16px; background:#0b7; border:none;">Submit Payment</button>
    <div id="result"></div>
    <script>
      document.getElementById('submit-btn').addEventListener('click', () => {
        const d = document.getElementById('result');
        d.innerText = 'SUCCESS';
      });
    </script>
  </body>
</html>
`;

const mutations: MutationCase[] = [
  {
    id: 'id-rename',
    label: 'ID rename (submit-btn -> confirm-pay-btn)',
    html: `
<html>
  <body style="font-family: Arial; padding: 20px;">
    <button id="confirm-pay-btn" class="primary" style="padding:10px 16px; background:#0b7; border:none;">Confirm Payment</button>
    <div id="result"></div>
    <script>
      document.getElementById('confirm-pay-btn').addEventListener('click', () => {
        const d = document.getElementById('result');
        d.innerText = 'SUCCESS';
      });
    </script>
  </body>
</html>
`,
    category: 'UI_UPDATE',
  },
  {
    id: 'text-change',
    label: 'Text change only',
    html: `
<html>
  <body style="font-family: Arial; padding: 20px;">
    <button id="submit-btn" class="primary" style="padding:10px 16px; background:#0b7; border:none;">Pay Now</button>
    <div id="result"></div>
    <script>
      document.getElementById('submit-btn').addEventListener('click', () => {
        const d = document.getElementById('result');
        d.innerText = 'SUCCESS';
      });
    </script>
  </body>
</html>
`,
    category: 'UI_UPDATE',
  },
  {
    id: 'overlay-block',
    label: 'Overlay blocking interaction',
    html: `
<html>
  <body style="font-family: Arial; padding: 20px; position: relative;">
    <button id="submit-btn" class="primary" style="padding:10px 16px; background:#0b7; border:none; position:relative; z-index: 1;">Submit Payment</button>
    <div id="result"></div>
    <div id="overlay" style="position:absolute; left:0; top:0; right:0; bottom:0; background:rgba(255,255,255,0.6); z-index: 10;"></div>
    <script>
      document.getElementById('submit-btn').addEventListener('click', () => {
        const d = document.getElementById('result');
        d.innerText = 'SUCCESS';
      });
    </script>
  </body>
</html>
`,
    category: 'BUG',
  },
  {
    id: 'handler-removed',
    label: 'Event handler removed',
    html: `
<html>
  <body style="font-family: Arial; padding: 20px;">
    <button id="submit-btn" class="primary" style="padding:10px 16px; background:#0b7; border:none;">Submit Payment</button>
    <div id="result"></div>
    <script>
      // handler intentionally removed -> bug
    </script>
  </body>
</html>
`,
    category: 'BUG',
  },
];

async function run() {
  // CLI args: --targets <file.json> (array of {id,label,baselineUrl,mutatedUrl,category}), --runs N, --outdir <dir>
  const argv = process.argv.slice(2);
  const getArg = (name: string) => {
    const idx = argv.indexOf(name);
    if (idx === -1) return undefined;
    return argv[idx + 1];
  };
  const targetsFile = getArg('--targets');
  const runs = parseInt(getArg('--runs') || '1', 10) || 1;
  const outdir = getArg('--outdir') || path.join(process.cwd(), 'dptr-experiments');
  const retries = parseInt(getArg('--retries') || '1', 10) || 1;

  await fs.promises.mkdir(outdir, { recursive: true });

  let taskCases: any[] = [];
  if (targetsFile) {
    try {
      const raw = await fs.promises.readFile(path.resolve(process.cwd(), targetsFile), 'utf8');
      const parsed = JSON.parse(raw);
      // expected array of { id, label, baselineUrl, mutatedUrl, category }
      taskCases = parsed;
    } catch (err) {
      console.error('Could not read targets file', targetsFile, err);
      process.exit(1);
    }
  } else {
    // fall back to built-in mutations (wrap them as cases with baselineHtml)
    taskCases = mutations.map((m) => ({ id: m.id, label: m.label, baselineHtml, mutatedHtml: m.html, category: m.category }));
  }

  const results: any[] = [];
  const browser = await chromium.launch({ headless: true });

  for (const task of taskCases) {
    for (let runIdx = 0; runIdx < runs; runIdx++) {
      const runId = `${task.id}-run-${runIdx + 1}-${Date.now()}`;
      const runDir = path.join(outdir, `${task.id}`, runId);
      await fs.promises.mkdir(runDir, { recursive: true });

      for (const engine of ['NO_HEAL', 'HEURISTIC', 'DPTR']) {
        const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
        const page = await context.newPage();
        const dptr = new DPTRResolver();

        // capture baseline
        if (task.baselineUrl) {
          try {
            await page.goto(task.baselineUrl, { timeout: 10000 });
            await dptr.captureContext(page, task.baselineSelector || '#submit-btn');
            const bpath = path.join(runDir, `baseline-${engine}.png`);
            await page.screenshot({ path: bpath, type: 'png', fullPage: true }).catch(() => {});
          } catch (err) {
            // ignore baseline capture errors
          }
        } else if (task.baselineHtml) {
          try {
            await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(task.baselineHtml)}`);
            await dptr.captureContext(page, task.baselineSelector || '#submit-btn');
            const bpath = path.join(runDir, `baseline-${engine}.png`);
            await page.screenshot({ path: bpath, type: 'png', fullPage: true }).catch(() => {});
          } catch (err) {
            // ignore
          }
        }

        // navigate to mutated page
        if (task.mutatedUrl) {
          await page.goto(task.mutatedUrl).catch(() => {});
        } else if (task.mutatedHtml) {
          await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(task.mutatedHtml)}`).catch(() => {});
        }

        // save mutated screenshot
        const mpath = path.join(runDir, `mutated-${engine}.png`);
        await page.screenshot({ path: mpath, type: 'png', fullPage: true }).catch(() => {});

        const runResult: any = {
          taskId: task.id,
          taskLabel: task.label,
          taskCategory: task.category || 'UNKNOWN',
          runId,
          engine,
          outcome: 'ERROR',
          repairedSelector: null,
          decision: null,
          domDistance: null,
          visualSimilarity: null,
          invariantPassed: null,
          error: null,
          artifactDir: runDir,
        };

        // attempt to click original selector with retries
        let attempt = 0;
        let succeeded = false;
        let lastErr: any = null;
        while (attempt < retries && !succeeded) {
          attempt += 1;
          try {
            await page.locator(task.selector || '#submit-btn').click({ timeout: 2000 });
            runResult.outcome = 'PASS';
            succeeded = true;
            break;
          } catch (err: any) {
            lastErr = err;
            // if not last retry, optionally wait a short backoff
            if (attempt < retries) await new Promise((r) => setTimeout(r, 250));
          }
        }
        if (!succeeded) {
          // original failed after retries
          if (engine === 'NO_HEAL') {
            runResult.outcome = 'FAIL';
          } else if (engine === 'HEURISTIC') {
            try {
              const res = await tryHeuristicRepairAndRun(page, task.selector || '#submit-btn', 'click', []);
              if (res.success) runResult.outcome = 'PASS';
              else runResult.outcome = 'FAIL';
              runResult.repairedSelector = res.repairedSelector || null;
              runResult.error = res.reason || null;
            } catch (e: any) {
              runResult.outcome = 'FAIL';
              runResult.error = e && e.message;
            }
          } else if (engine === 'DPTR') {
            try {
              await dptr.tryRepairAndRun(page, task.selector || '#submit-btn', 'click', []);
              // if no error thrown, DPTR performed heal and action
              runResult.outcome = 'PASS';
              const evalRes = dptr.lastEvaluation.get(task.selector || '#submit-btn');
              if (evalRes) {
                runResult.decision = evalRes.decision;
                runResult.domDistance = evalRes.domDistance;
                runResult.visualSimilarity = evalRes.visualSimilarity;
                runResult.invariantPassed = evalRes.invariantPassed;
                runResult.repairedSelector = evalRes.reason;
              }
            } catch (e: any) {
              // DPTR rejected repair or unknown
              runResult.outcome = 'FAIL';
              const evalRes = dptr.lastEvaluation.get(task.selector || '#submit-btn');
              if (evalRes) {
                runResult.decision = evalRes.decision;
                runResult.domDistance = evalRes.domDistance;
                runResult.visualSimilarity = evalRes.visualSimilarity;
                runResult.invariantPassed = evalRes.invariantPassed;
                runResult.error = evalRes.reason;
              } else {
                runResult.error = e && e.message;
              }
            }
          }
        }

        results.push(runResult);

        // persist intermediate results so partial progress is saved
        const interim = path.join(runDir, `${task.id}-${engine}-result.json`);
        await fs.promises.writeFile(interim, JSON.stringify(runResult, null, 2)).catch(() => {});

        await context.close();
      }
    }
  }

  await browser.close();

  const out = path.join(outdir, 'experiment-results.json');
  await fs.promises.writeFile(out, JSON.stringify(results, null, 2));

  // also write a CSV summary for easy analysis
  try {
    const csvPath = path.join(outdir, 'experiment-results.csv');
    const headers = ['taskId', 'taskLabel', 'taskCategory', 'runId', 'engine', 'outcome', 'decision', 'domDistance', 'visualSimilarity', 'invariantPassed', 'repairedSelector', 'error', 'artifactDir'];
    const lines = [headers.join(',')];
    for (const r of results) {
      const row = headers.map((h) => {
        const v = (r as any)[h];
        if (v === null || v === undefined) return '';
        return String(v).replace(/"/g, '""');
      }).join(',');
      lines.push(row);
    }
    await fs.promises.writeFile(csvPath, lines.join('\n'));
    console.log('Wrote results to', out);
    console.log('Wrote CSV to', csvPath);
  } catch (err) {
    console.log('Wrote results to', out);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
