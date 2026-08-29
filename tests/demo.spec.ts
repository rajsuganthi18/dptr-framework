import { test, expect } from '../src/dptr-fixture';
import { Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Two demo scenarios:
 * - Scenario A: Clean UI update (id changed). DPTR must HEAL and PASS.
 * - Scenario B: Genuine Bug Mutation (button is hidden behind an overlay). DPTR must REJECT repair and FAIL.
 *
 * We register a baseline snapshot for the selector '#submit-btn' by loading a golden data URL page,
 * capturing the baseline, then navigating to mutated pages to exercise healing or bug rejection.
 */

function dataUrl(html: string) {
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
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

// Scenario A: cleaned up UI - id changed and text changed slightly
const scenarioAHtml = `
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
`;

// Scenario B: button exists but is obscured by overlay (blocks clicks)
const scenarioBHtml = `
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
`;

test('Scenario A: Clean UI update -> DPTR HEALs and action succeeds', async ({ page, dptr }) => {
  // Capture baseline context
  await page.goto(dataUrl(baselineHtml));
  const baselineCtx = await dptr.captureContext(page, '#submit-btn');
  dptr.registerBaseline('#submit-btn', baselineCtx);

  // Navigate to updated page where ID changed
  await page.goto(dataUrl(scenarioAHtml));

  // Try to click using the old selector. The DPTR fixture will attempt healing on failure.
  await page.locator('#submit-btn').click();

  // Verify effect of click
  await expect(page.locator('#result')).toHaveText('SUCCESS', { timeout: 2000 });

  // Check DPTR decision
  const evalRes = dptr.lastEvaluation.get('#submit-btn');
  expect(evalRes).toBeTruthy();
  expect(evalRes!.decision).toBe('HEAL');
  expect(evalRes!.confidenceScore).toBeGreaterThan(0.4);
});

test('Scenario B: Genuine bug (obscured) -> DPTR should REJECT repair and preserve failure', async ({ page, dptr }) => {
  // baseline capture
  await page.goto(dataUrl(baselineHtml));
  const baselineCtx = await dptr.captureContext(page, '#submit-btn');
  dptr.registerBaseline('#submit-btn', baselineCtx);

  // Navigate to buggy page where overlay blocks button
  await page.goto(dataUrl(scenarioBHtml));

  // Attempting to click should cause DPTR to attempt healing but ultimately reject and throw.
  let thrown = false;
  try {
    await page.locator('#submit-btn').click({ timeout: 1500 });
  } catch (err: any) {
    thrown = true;
    // we expect DPTR to set lastEvaluation decision to REJECT_BUG
    const evalRes = dptr.lastEvaluation.get('#submit-btn');
    expect(evalRes).toBeTruthy();
    expect(evalRes!.decision).toBe('REJECT_BUG');
  }
  expect(thrown).toBe(true);
});
