import { LocatingContext } from './dptr-types';

// Simple normalized Levenshtein distance for text similarity
function levenshtein(a: string, b: string): number {
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;

  const dp: number[] = new Array(bl + 1).fill(0);
  for (let j = 0; j <= bl; ++j) dp[j] = j;

  for (let i = 1; i <= al; ++i) {
    let prev = dp[0] ?? 0;
    dp[0] = i;

    for (let j = 1; j <= bl; ++j) {
      const cur = dp[j] ?? 0;
      const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      dp[j] = Math.min(
        (dp[j] ?? 0) + 1,
        (dp[j - 1] ?? 0) + 1,
        prev + cost
      );
      prev = cur;
    }
  }

  return dp[bl] ?? 0;
}

export function normalizedTextSimilarity(a = '', b = ''): number {
  a = (a || '').trim().toLowerCase();
  b = (b || '').trim().toLowerCase();
  if (!a && !b) return 1;
  const d = levenshtein(a, b);
  const max = Math.max(a.length, b.length) || 1;
  return 1 - d / max;
}

/**
 * Compute a DOM distance (0..1) between baseline and candidate.
 * Lower means more similar.
 */
export function computeDomDistance(baseline: LocatingContext, candidate: LocatingContext): number {
  // Tag mismatch penalizes
  let score = 0;
  if (baseline.tag !== candidate.tag) score += 0.25;

  // Attribute coverage: compute Jaccard-like overlap for attribute names and values
  const baseAttrs = baseline.attributes || {};
  const candAttrs = candidate.attributes || {};
  const baseKeys = Object.keys(baseAttrs);
  const candKeys = Object.keys(candAttrs);
  const keyUnion = new Set([...baseKeys, ...candKeys]);
  let attrScore = 0;
  if (keyUnion.size === 0) {
    attrScore = 1;
  } else {
    let matchCount = 0;
    keyUnion.forEach((k) => {
      const baseVal = baseAttrs[k];
      const candVal = candAttrs[k];

      if (typeof baseVal === 'string' && typeof candVal === 'string') {
        if (baseVal === candVal) matchCount += 1;
        else if (baseVal.includes(candVal) || candVal.includes(baseVal)) {
          matchCount += 0.6;
        }
      }
    });
    attrScore = matchCount / keyUnion.size;
  }
  // invert to distance contribution
  score += (1 - attrScore) * 0.35;

  // Text similarity contribution
  const textSim = normalizedTextSimilarity(baseline.textContent, candidate.textContent);
  score += (1 - textSim) * 0.25;

  // Spatial proximity if both bounding boxes present
  const bBoxA = baseline.boundingBox;
  const bBoxB = candidate.boundingBox;
  if (bBoxA && bBoxB) {
    const centerA = { x: bBoxA.x + bBoxA.width / 2, y: bBoxA.y + bBoxA.height / 2 };
    const centerB = { x: bBoxB.x + bBoxB.width / 2, y: bBoxB.y + bBoxB.height / 2 };
    const dx = centerA.x - centerB.x;
    const dy = centerA.y - centerB.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // normalize by a heuristic viewport diagonal (assume 1000px)
    const norm = Math.min(1, dist / 1000);
    score += norm * 0.15;
  } else {
    score += 0.075; // minor penalty if no boxes
  }

  // Clamp 0..1
  return Math.min(1, Math.max(0, score));
}
