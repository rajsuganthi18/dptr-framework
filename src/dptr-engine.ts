import { Page, Locator } from '@playwright/test';
import { LocatingContext, OracleEvaluationResult, OracleDecision } from './dptr-types';
import { computeDomDistance } from './dom-delta';
import { captureElementBuffer, evaluateVisualSimilarity, visualSimilarityFromBuffers } from './visual-oracle';
import { InvariantVerifier } from './invariant-verifier';

/**
 * DPTRResolver is the core of the prototype.
 * It stores baseline locating contexts (captured from a golden page), and when a locator action
 * fails it attempts to find candidate elements, score them, and either HEAL or REJECT_BUG.
 */
export class DPTRResolver {
  private baselines: Map<string, LocatingContext> = new Map();
  public lastEvaluation: Map<string, OracleEvaluationResult> = new Map();

  registerBaseline(selector: string, ctx: LocatingContext) {
    this.baselines.set(selector, ctx);
  }

  getBaseline(selector: string): LocatingContext | undefined {
    return this.baselines.get(selector);
  }

  async captureContext(page: Page, selector: string): Promise<LocatingContext> {
    const locator = page.locator(selector).first();
    const tag = await locator.evaluate((el) => el.tagName.toLowerCase()).catch(() => 'div');
    const textContent = (await locator.innerText().catch(() => '')).trim();
    const attrs = await locator.evaluate((el) => {
      const out: Record<string, string> = {};
      for (let i = 0; i < el.attributes.length; i++) {
        const a = el.attributes.item(i)!;
        out[a.name] = a.value;
      }
      return out;
    }).catch(() => ({}));
    const boundingBox = await locator.boundingBox().catch(() => null);
    const screenshotBuffer = await captureElementBuffer(page, locator).catch(() => undefined);
    const ctx: LocatingContext = {
      originalSelector: selector,
      tag,
      textContent,
      boundingBox,
      attributes: attrs,
      screenshotBuffer,
    };
    this.registerBaseline(selector, ctx);
    return ctx;
  }

  /**
   * Attempt to repair an action targeting `selector`.
   * If a repair is successful, executes the requested action on the repaired locator object.
   * actionFnName: e.g., 'click', 'fill'
   */
  async tryRepairAndRun(page: Page, selector: string, actionFnName: string, actionArgs: any[]): Promise<any> {
    const baseline = this.getBaseline(selector);
    if (!baseline) {
      // No baseline to compare to; can't heal.
      const res: OracleEvaluationResult = {
        decision: 'UNKNOWN',
        confidenceScore: 0,
        domDistance: 1,
        visualSimilarity: 0,
        invariantPassed: false,
        reason: 'No baseline context registered for selector',
      };
      this.lastEvaluation.set(selector, res);
      throw new Error(`DPTR: No baseline for selector ${selector}. Original action failed and no repair attempted.`);
    }

    // Find candidate nodes that might match baseline: search page for elements with same tag OR role/button semantics
    // Strategy: collect candidates from querySelectorAll by tag and by text similarity heuristics
    const candidatesInfo: LocatingContext[] = await page.evaluate(
      (baselineTag, baselineText) => {
        const all = Array.from(document.querySelectorAll(baselineTag));
        // include elements with role=button or button tags if tag mismatches
        const extras = Array.from(document.querySelectorAll('[role="button"], button, a'));
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
            // We cannot capture screenshots here; will be captured by Playwright locator below
          };
        });
      },
      baseline.tag,
      baseline.textContent
    );

    // Convert candidateInfo into real LocatingContexts with screenshots
    const enrichedCandidates: LocatingContext[] = [];
    for (let i = 0; i < candidatesInfo.length; i++) {
      const c = candidatesInfo[i];
      // best-effort use of attribute heuristics to build a selector for Playwright to find the element
      let candidateSelector = c.tag;
      // if id present, prefer id
      if (c.attributes && c.attributes['id']) candidateSelector = `#${c.attributes['id']}`;
      else if (c.attributes && c.attributes['class']) {
        candidateSelector = `${c.tag}.${c.attributes['class'].split(' ').filter(Boolean).join('.')}`;
      } else if (c.textContent && c.textContent.length > 0) {
        // use text selector
        candidateSelector = `${c.tag}:has-text("${c.textContent.slice(0, 30)}")`;
      }
      const locator = page.locator(candidateSelector).first();
      const boundingBox = await locator.boundingBox().catch(() => c.boundingBox || null);
      const screenshotBuffer = await (async () => {
        try {
          return await locator.screenshot({ type: 'png' });
        } catch {
          return undefined;
        }
      })();
      enrichedCandidates.push({
        originalSelector: selector,
        tag: c.tag,
        textContent: c.textContent,
        attributes: c.attributes,
        boundingBox,
        screenshotBuffer,
      });
    }

    // Score each candidate via DOM and Visual similarity + invariants
    const scored: { candidate: LocatingContext; domDistance: number; visualSim: number; invariant: boolean; reason?: string }[] = [];
    for (const cand of enrichedCandidates) {
      const domDistance = computeDomDistance(baseline, cand);
      const visualSim = evaluateVisualSimilarity(baseline, cand); // 0..1
      // construct a Playwright locator for invariant checks; try id/class/text as earlier
      let candidateSelector = cand.attributes && cand.attributes['id'] ? `#${cand.attributes['id']}` : undefined;
      if (!candidateSelector && cand.attributes && cand.attributes['class']) {
        candidateSelector = `${cand.tag}.${cand.attributes['class'].split(' ').filter(Boolean).join('.')}`;
      }
      // fallback by text:
      if (!candidateSelector && cand.textContent && cand.textContent.length > 0) {
        candidateSelector = `${cand.tag}:has-text("${cand.textContent.slice(0, 30)}")`;
      }
      let invariantPassed = false;
      let invariantReason = 'Could not evaluate invariant';
      if (candidateSelector) {
        const locator = page.locator(candidateSelector).first();
        const inv = await InvariantVerifier.isElementClickable(page, locator);
        invariantPassed = !!inv.ok;
        invariantReason = inv.reason || '';
      } else {
        invariantReason = 'No stable selector for invariant evaluation';
      }

      scored.push({ candidate: cand, domDistance, visualSim, invariant: invariantPassed, reason: invariantReason });
    }

    // sort candidates by combined heuristic: prefer low domDistance, high visualSim, invariant true
    scored.sort((a, b) => {
      const aScore = (1 - a.domDistance) * 0.6 + a.visualSim * 0.3 + (a.invariant ? 0.1 : 0);
      const bScore = (1 - b.domDistance) * 0.6 + b.visualSim * 0.3 + (b.invariant ? 0.1 : 0);
      return bScore - aScore;
    });

    // thresholding: require domDistance < 0.6 and visualSim > 0.45 and invariant true (conservative)
    const best = scored[0];
    if (best && best.domDistance < 0.6 && best.visualSim > 0.45 && best.invariant) {
      // HEAL path
      // Build a locator for the healed element
      const pick = best.candidate;
      let healedSelector = pick.attributes && pick.attributes['id'] ? `#${pick.attributes['id']}` : undefined;
      if (!healedSelector && pick.attributes && pick.attributes['class']) healedSelector = `${pick.tag}.${pick.attributes['class'].split(' ').filter(Boolean).join('.')}`;
      if (!healedSelector && pick.textContent) healedSelector = `${pick.tag}:has-text("${pick.textContent.slice(0, 30)}")`;
      const healedLocator = healedSelector ? page.locator(healedSelector).first() : null;

      const evalRes: OracleEvaluationResult = {
        decision: 'HEAL',
        confidenceScore: (1 - best.domDistance) * 0.6 + best.visualSim * 0.4,
        domDistance: best.domDistance,
        visualSimilarity: best.visualSim,
        invariantPassed: best.invariant,
        reason: `Healed to selector ${healedSelector} (reason: ${best.reason})`,
      };
      this.lastEvaluation.set(selector, evalRes);

      if (!healedLocator) {
        // Shouldn't happen usually; fallback to throwing
        throw new Error('DPTR: Could not construct healed locator although candidate passed heuristics');
      }

      // Execute the intended action on healed locator
      const func = (healedLocator as any)[actionFnName];
      if (typeof func === 'function') {
        // run the action with provided args
        return await func.apply(healedLocator, actionArgs);
      } else {
        throw new Error(`DPTR: healed locator has no action ${actionFnName}`);
      }
    }

    // No candidate passed robust thresholds -> Decide whether REJECT_BUG or UNKNOWN
    // If we have candidates but invariant false or visual low, treat as REJECT_BUG (preserve defect)
    let decision: OracleDecision = 'UNKNOWN';
    let reason = 'No confident candidate found';
    if (scored.length === 0) {
      decision = 'REJECT_BUG';
      reason = 'No candidates found on page';
    } else {
      const bestCandidate = scored[0];
      if (!bestCandidate.invariant || bestCandidate.visualSim < 0.4) {
        decision = 'REJECT_BUG';
        reason = `Best candidate failed invariant or visual checks (visual=${bestCandidate.visualSim}, invariant=${bestCandidate.invariant})`;
      } else {
        decision = 'UNKNOWN';
        reason = 'Candidates ambiguous';
      }
    }

    const evalRes: OracleEvaluationResult = {
      decision,
      confidenceScore: 1 - (best ? best.domDistance : 1),
      domDistance: best ? best.domDistance : 1,
      visualSimilarity: best ? best.visualSim : 0,
      invariantPassed: best ? best.invariant : false,
      reason,
    };
    this.lastEvaluation.set(selector, evalRes);

    // If REJECT_BUG: preserve original failure by throwing
    if (decision === 'REJECT_BUG') {
      throw new Error(`DPTR: Repair rejected for selector ${selector}. Reason: ${reason}`);
    }

    // Otherwise unknown: throw to preserve failure
    throw new Error(`DPTR: Repair unknown for selector ${selector}. Reason: ${reason}`);
  }
}
