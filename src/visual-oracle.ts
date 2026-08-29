import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { LocatingContext } from './dptr-types';
import { Page, Locator } from '@playwright/test';

/**
 * Compute visual similarity between two PNG Buffers.
 * Returns similarity in 0..1 (higher = more similar)
 */
export function visualSimilarityFromBuffers(aBuffer?: Buffer, bBuffer?: Buffer): number {
  if (!aBuffer || !bBuffer) return 0;
  try {
    const imgA = PNG.sync.read(aBuffer);
    const imgB = PNG.sync.read(bBuffer);
    if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
      // sizes differ; attempt to compare with minimal overlap by returning conservative low similarity
      return 0.25;
    }
    const { width, height } = imgA;
    const diffPixels = pixelmatch(imgA.data, imgB.data, null as any, width, height, { threshold: 0.12 });
    const total = width * height;
    const sim = 1 - diffPixels / total;
    return Math.max(0, Math.min(1, sim));
  } catch (err) {
    return 0;
  }
}

/**
 * Capture an element screenshot buffer using Playwright.
 * Accepts either a Locator or a bounding box and page.
 */
export async function captureElementBuffer(page: Page, locator: Locator): Promise<Buffer | undefined> {
  try {
    // using locator.screenshot gives us the element-cropped PNG buffer
    const buf = await locator.screenshot({ type: 'png' });
    return buf;
  } catch (err) {
    // Might fail if element not visible or detached
    return undefined;
  }
}

/**
 * Heuristic that distinguishes minor CSS tweaks (high similarity)
 * from missing/obscured elements (low similarity).
 * Returns 0..1
 */
export function evaluateVisualSimilarity(baseline: LocatingContext, candidate: LocatingContext): number {
  return visualSimilarityFromBuffers(baseline.screenshotBuffer, candidate.screenshotBuffer);
}

/**
 * Find best matching region of `templateBuffer` within a full-page screenshot.
 * Uses a coarse grid search and pixelmatch to score patches. Returns best match
 * coordinates and score (0..1) or undefined if not found.
 */
export async function findBestMatchOnPage(page: Page, templateBuffer: Buffer, opts?: { step?: number, maxCandidates?: number }) {
  if (!templateBuffer) return undefined;
  try {
    const fullBuf = await page.screenshot({ type: 'png', fullPage: true });
    const fullImg = PNG.sync.read(fullBuf);
    const tplImg = PNG.sync.read(templateBuffer);
    const fw = fullImg.width, fh = fullImg.height;
    const tw = tplImg.width, th = tplImg.height;
    if (tw > fw || th > fh) return undefined;
    const step = opts && opts.step ? opts.step : Math.max(8, Math.floor(Math.min(fw, fh) / 50));
    let bestScore = -1;
    let best: { x: number; y: number; score: number } | undefined = undefined;
    const maxCandidates = opts && opts.maxCandidates ? opts.maxCandidates : 2000;
    let tried = 0;
    for (let y = 0; y <= fh - th; y += step) {
      for (let x = 0; x <= fw - tw; x += step) {
        // build subdata buffer for this patch
        const sub = Buffer.alloc(tw * th * 4);
        let pos = 0;
        for (let row = 0; row < th; row++) {
          const srcStart = ((y + row) * fw + x) * 4;
          const srcEnd = srcStart + tw * 4;
          fullImg.data.copy(sub, pos, srcStart, srcEnd);
          pos += tw * 4;
        }
        const diff = pixelmatch(tplImg.data, sub, null as any, tw, th, { threshold: 0.12 });
        const total = tw * th;
        const score = 1 - diff / total;
        if (score > bestScore) {
          bestScore = score;
          best = { x, y, score };
        }
        tried += 1;
        if (tried >= maxCandidates) break;
      }
      if (tried >= maxCandidates) break;
    }
    return best ? { x: best.x, y: best.y, width: tw, height: th, score: best.score } : undefined;
  } catch (err) {
    return undefined;
  }
}
