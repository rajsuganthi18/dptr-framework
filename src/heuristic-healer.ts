import { Page } from '@playwright/test';
import { computeDomDistance } from './dom-delta';
import { LocatingContext } from './dptr-types';

/**
 * A simple, aggressive heuristic healer used as a baseline for experiments.
 * It attempts to find a replacement element by coarse heuristics and execute the action.
 * This healer intentionally omits invariant checks to demonstrate false-healing behavior.
 */
export async function tryHeuristicRepairAndRun(page: Page, selector: string, actionFnName: string, actionArgs: any[]): Promise<{ success: boolean; repairedSelector?: string; reason?: string }> {
  // Collect candidate nodes (by tag and common interactive elements)
  const baselineTag = selector.replace(/[^a-zA-Z]/g, '') || 'button';
  const candidates = await page.evaluate((baselineTag) => {
    const all = Array.from(document.querySelectorAll(baselineTag));
    const extras = Array.from(document.querySelectorAll('button, a, [role="button"]'));
    const pool = Array.from(new Set([...all, ...extras])).slice(0, 200);
    return pool.map((el) => {
      const rect = el.getBoundingClientRect();
      const attrs: Record<string, string> = {};
      for (let i = 0; i < el.attributes.length; i++) {
        const a = el.attributes.item(i)!;
        attrs[a.name] = a.value;
      }
      return {
        tag: el.tagName.toLowerCase(),
        textContent: (el.textContent || '').trim(),
        attributes: attrs,
        boundingBox: rect && rect.width && rect.height ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
      };
    });
  }, baselineTag);

  // Try to pick a candidate by simple heuristics: prefer same tag, then id, then text similarity
  for (const c of candidates) {
    let candidateSelector = c.attributes && c.attributes['id'] ? `#${c.attributes['id']}` : undefined;
    if (!candidateSelector && c.attributes && c.attributes['class']) {
      candidateSelector = `${c.tag}.${c.attributes['class'].split(' ').filter(Boolean).join('.')}`;
    }
    if (!candidateSelector && c.textContent && c.textContent.length > 0) {
      candidateSelector = `${c.tag}:has-text("${c.textContent.slice(0, 30)}")`;
    }
    if (!candidateSelector) continue;
    const locator = page.locator(candidateSelector).first();
    try {
      // Aggressive: attempt action without invariant verification
      const func = (locator as any)[actionFnName];
      if (typeof func === 'function') {
        await func.apply(locator, actionArgs);
        return { success: true, repairedSelector: candidateSelector, reason: 'Heuristic matched candidate and action succeeded' };
      }
    } catch (err) {
      // ignore and continue searching
    }
  }

  return { success: false, reason: 'Heuristic found no candidate or actions failed' };
}
