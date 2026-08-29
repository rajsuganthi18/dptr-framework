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
