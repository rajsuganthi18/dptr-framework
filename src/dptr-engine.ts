import { Page, Locator } from '@playwright/test';
import { LocatingContext, OracleEvaluationResult, OracleDecision } from './dptr-types';
import { computeDomDistance, normalizedTextSimilarity } from './dom-delta';
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

  private async discoverCandidateElements(page: Page, baseline: LocatingContext): Promise<any[]> {
    const selectors = [
      'button',
      'a',
      'input[type="button"], input[type="submit"], input[type="reset"]',
      '[role="button"]',
      '[role="link"]',
      '[data-testid]',
      '[aria-label]',
      '*'
    ];

    const results = await page.evaluate(({ baseTag, baseText }) => {
      const elements = Array.from(document.querySelectorAll('button, a, input, [role="button"], [role="link"], [data-testid], [aria-label], *'));
      const seen = new Set<string>();
      const out: any[] = [];

      for (const el of elements) {
        const rect = el.getBoundingClientRect();
        const attrs: Record<string, string> = {};
        for (let i = 0; i < el.attributes.length; i++) {
          const a = el.attributes.item(i)!;
          attrs[a.name] = a.value;
        }

        const textContent = (el.textContent || '').trim();
        const tag = el.tagName.toLowerCase();
        const key = `${tag}|${textContent}|${attrs.id || ''}|${attrs.class || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!rect || !rect.width || !rect.height) continue;
        out.push({
          tag,
          textContent,
          attributes: attrs,
          boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        });
      }

      return out.slice(0, 80);
    }, { baseTag: baseline.tag, baseText: baseline.textContent });

    return Array.isArray(results) ? results : [];
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

    // Find candidate nodes that might match the baseline using a paged locator-based scan.
    // This is more robust for dynamic and stateful gaming UIs where page.evaluate can fail
    // or where the target element has shifted across a mutated DOM tree.
    let candidatesInfo: any[] = [];
    try {
      candidatesInfo = await this.discoverCandidateElements(page, baseline);
    } catch (err: any) {
      // If discovery fails for any reason, keep the system explicit and conservative instead of
      // letting an unexpected page-level error masquerade as a heal or a bug decision.
      candidatesInfo = [];
    }

    // If no DOM candidates found and we have a baseline screenshot, try template matching
    if (candidatesInfo.length === 0 && baseline.screenshotBuffer) {
      try {
        const match = await (await import('./visual-oracle')).findBestMatchOnPage(page, baseline.screenshotBuffer);
        if (match && match.score > 0.35) {
          // create a synthetic candidate entry matching the shape used below
          candidatesInfo.push({
            tag: 'canvas-region',
            textContent: '',
            attributes: {},
            boundingBox: { x: match.x, y: match.y, width: match.width, height: match.height },
            _templateMatchScore: match.score,
          });
        }
      } catch (err) {
        // ignore template matching failures
      }
    }

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
      let boundingBox = null;
      let screenshotBuffer: Buffer | undefined = undefined;
      // If this is a synthetic canvas-region candidate, capture by page screenshot clip
      if (c._templateMatchScore && c.boundingBox) {
        boundingBox = c.boundingBox;
        try {
          const clip = { x: Math.max(0, Math.floor(boundingBox.x)), y: Math.max(0, Math.floor(boundingBox.y)), width: Math.max(1, Math.floor(boundingBox.width)), height: Math.max(1, Math.floor(boundingBox.height)) } as any;
          screenshotBuffer = await page.screenshot({ type: 'png', clip }).catch(() => undefined);
        } catch {
          screenshotBuffer = undefined;
        }
      } else {
        const locator = page.locator(candidateSelector).first();
        boundingBox = await locator.boundingBox().catch(() => c.boundingBox || null);
        screenshotBuffer = await (async () => {
          try {
            return await locator.screenshot({ type: 'png' });
          } catch {
            return undefined;
          }
        })();
      }
      enrichedCandidates.push({
        originalSelector: selector,
        tag: c.tag,
        textContent: c.textContent,
        attributes: c.attributes,
        boundingBox,
        screenshotBuffer,
        // preserve template match score if present
        ...(c._templateMatchScore ? { templateMatchScore: c._templateMatchScore } : {}),
      });
    }

    // Score each candidate via DOM and Visual similarity + invariants
    const scored: { candidate: LocatingContext; domDistance: number; visualSim: number; invariant: boolean; reason?: string; textSim: number; score: number }[] = [];
    for (const cand of enrichedCandidates) {
      const domDistance = computeDomDistance(baseline, cand);
      const visualSim = evaluateVisualSimilarity(baseline, cand); // 0..1
      const textSim = normalizedTextSimilarity(baseline.textContent, cand.textContent);
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
      } else if ((cand as any).templateMatchScore) {
        invariantPassed = !!((cand as any).templateMatchScore > 0.6);
        invariantReason = `Template match score ${(cand as any).templateMatchScore}`;
      } else {
        invariantReason = 'No stable selector for invariant evaluation';
      }

      const score = (1 - domDistance) * 0.45 + visualSim * 0.25 + textSim * 0.25 + (invariantPassed ? 0.15 : 0);
      scored.push({ candidate: cand, domDistance, visualSim, invariant: invariantPassed, reason: invariantReason, textSim, score });
    }

    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];
    const bestCombinedScore = best ? best.score : 0;
    const shouldHeal = !!best &&
      bestCombinedScore >= 0.42 &&
      best.invariant &&
      (best.domDistance < 0.8 || best.visualSim > 0.4 || best.textSim > 0.25);

    if (shouldHeal) {
      // HEAL path
      const pick = best.candidate;
      let healedSelector = pick.attributes && pick.attributes['id'] ? `#${pick.attributes['id']}` : undefined;
      if (!healedSelector && pick.attributes && pick.attributes['class']) healedSelector = `${pick.tag}.${pick.attributes['class'].split(' ').filter(Boolean).join('.')}`;
      if (!healedSelector && pick.textContent) healedSelector = `${pick.tag}:has-text("${pick.textContent.slice(0, 30)}")`;
      const healedLocator = healedSelector ? page.locator(healedSelector).first() : null;

      const evalRes: OracleEvaluationResult = {
        decision: 'HEAL',
        confidenceScore: bestCombinedScore,
        domDistance: best.domDistance,
        visualSimilarity: best.visualSim,
        invariantPassed: best.invariant,
        reason: `Healed to selector ${healedSelector} (reason: ${best.reason})`,
      };
      this.lastEvaluation.set(selector, evalRes);

      if (!healedLocator) {
        throw new Error('DPTR: Could not construct healed locator although candidate passed heuristics');
      }

      const func = (healedLocator as any)[actionFnName];
      if (typeof func === 'function') {
        return await func.apply(healedLocator, actionArgs);
      }
      throw new Error(`DPTR: healed locator has no action ${actionFnName}`);
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
