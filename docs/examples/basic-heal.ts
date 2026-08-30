import { test, expect } from '@playwright/test';
import { DPTRResolver } from '../../src/dptr-engine';

test('basic heal example', async ({ page }) => {
  const dptr = new DPTRResolver();

  await page.setContent(`
    <button id="submit-btn">Submit</button>
    <div id="result"></div>
    <script>
      document.getElementById('submit-btn').addEventListener('click', () => {
        document.getElementById('result').textContent = 'OK';
      });
    </script>
  `);

  const baseline = await dptr.captureContext(page, '#submit-btn');
  dptr.registerBaseline('#submit-btn', baseline);

  await page.setContent(`
    <button id="confirm-btn">Confirm</button>
    <div id="result"></div>
    <script>
      document.getElementById('confirm-btn').addEventListener('click', () => {
        document.getElementById('result').textContent = 'OK';
      });
    </script>
  `);

  await page.locator('#submit-btn').click();

  await expect(page.locator('#result')).toHaveText('OK');

  const evaluation = dptr.lastEvaluation.get('#submit-btn');
  if (evaluation) {
    console.log(evaluation.decision, evaluation.confidenceScore);
  }
});
