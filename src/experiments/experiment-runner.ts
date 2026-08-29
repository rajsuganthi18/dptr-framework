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
  const results: any[] = [];
  const browser = await chromium.launch({ headless: true });

  for (const mutation of mutations) {
    for (const engine of ['NO_HEAL', 'HEURISTIC', 'DPTR']) {
      const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
      const page = await context.newPage();
      const dptr = new DPTRResolver();
      // capture baseline
      await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(baselineHtml)}`);
      try {
        await dptr.captureContext(page, '#submit-btn');
      } catch (err) {
        // ignore
      }

      // navigate to mutated page
      await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(mutation.html)}`);

      const runResult: any = {
        mutation: mutation.id,
        mutationLabel: mutation.label,
        mutationCategory: mutation.category,
        engine,
        outcome: 'ERROR',
        repairedSelector: null,
        decision: null,
        domDistance: null,
        visualSimilarity: null,
        invariantPassed: null,
        error: null,
      };

      // attempt to click original selector
      try {
        await page.locator('#submit-btn').click({ timeout: 2000 });
        runResult.outcome = 'PASS';
      } catch (err: any) {
        // original failed
        if (engine === 'NO_HEAL') {
          runResult.outcome = 'FAIL';
        } else if (engine === 'HEURISTIC') {
          try {
            const res = await tryHeuristicRepairAndRun(page, '#submit-btn', 'click', []);
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
            await dptr.tryRepairAndRun(page, '#submit-btn', 'click', []);
            // if no error thrown, DPTR performed heal and action
            runResult.outcome = 'PASS';
            const evalRes = dptr.lastEvaluation.get('#submit-btn');
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
            const evalRes = dptr.lastEvaluation.get('#submit-btn');
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

      await context.close();
    }
  }

  await browser.close();

  const out = path.join(process.cwd(), 'experiment-results.json');
  await fs.promises.writeFile(out, JSON.stringify(results, null, 2));
  console.log('Wrote results to', out);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
