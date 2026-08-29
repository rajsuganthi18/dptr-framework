import { Page, Locator, ElementHandle } from '@playwright/test';
import { LocatingContext } from './dptr-types';

export class InvariantVerifier {
  /**
   * Is the element sufficiently visible and on-top (not obscured) to be clickable?
   * Uses elementFromPoint at center to detect the topmost element and compares identity.
   */
  static async isElementClickable(page: Page, locator: Locator): Promise<{ ok: boolean; reason?: string }> {
    try {
      const bbox = await locator.boundingBox();
      if (!bbox || bbox.width < 2 || bbox.height < 2) {
        return { ok: false, reason: 'Element bounding box missing or too small' };
      }

      // Check computed styles: display/visibility/opacity/pointer-events
      const styleChecks = await locator.evaluate((el) => {
        const s = window.getComputedStyle(el);
        return {
          display: s.display,
          visibility: s.visibility,
          opacity: parseFloat(s.opacity || '1'),
          pointerEvents: s.pointerEvents,
        };
      });
      if (styleChecks.display === 'none' || styleChecks.visibility === 'hidden' || styleChecks.opacity < 0.05) {
        return { ok: false, reason: 'Element not visible via computed styles' };
      }

      // Use elementFromPoint to see what's actually topmost at the element center
      const centerX = Math.round(bbox.x + bbox.width / 2);
      const centerY = Math.round(bbox.y + bbox.height / 2);

      const topTag = await page.evaluate(
        ({ x, y }) => {
          const el = document.elementFromPoint(x, y);
          if (!el) return null;
          // Build a short descriptor
          return {
            tagName: el.tagName,
            id: (el as HTMLElement).id || null,
            className: (el as HTMLElement).className || null,
            pointerEvents: window.getComputedStyle(el).pointerEvents,
          };
        },
        { x: centerX, y: centerY }
      );

      // If top element is not the same as our locator's element (by id/class/tag heuristics), it's probably obscured
      const candidateDesc = await locator.evaluate((el) => ({ tagName: el.tagName, id: (el as HTMLElement).id || null, className: (el as HTMLElement).className || null }));
      if (!topTag) {
        return { ok: false, reason: 'No top element at point (maybe offscreen)' };
      }

      const matchesId = topTag.id && candidateDesc.id && topTag.id === candidateDesc.id;
      const matchesTagAndClass = topTag.tagName === candidateDesc.tagName && topTag.className === candidateDesc.className;
      const topBlocks = topTag.pointerEvents !== 'none';

      if (matchesId || matchesTagAndClass) {
        // Top element appears to be the candidate itself
        if (!topBlocks) {
          // Even if it's itself but pointer-events none, not clickable
          return { ok: false, reason: 'Element has pointer-events: none' };
        }
        return { ok: true };
      } else {
        // Something else on top:
        if (!topBlocks) {
          // If top element has pointer-events none, it won't block; still check deeper
          return { ok: true, reason: 'Top element is pointer-events:none so click should pass through' };
        }
        return { ok: false, reason: 'Element is obscured by another element' };
      }
    } catch (err: any) {
      return { ok: false, reason: 'Error during invariant evaluation: ' + (err && err.message) };
    }
  }
}
