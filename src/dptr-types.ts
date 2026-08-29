export type OracleDecision = 'HEAL' | 'REJECT_BUG' | 'UNKNOWN';

export interface LocatingContext {
  originalSelector: string;
  tag: string;
  textContent: string;
  boundingBox: { x: number; y: number; width: number; height: number } | null;
  attributes: Record<string, string>;
  screenshotBuffer?: Buffer;
}

export interface OracleEvaluationResult {
  decision: OracleDecision;
  confidenceScore: number; // 0..1
  domDistance: number; // 0..1 (lower = more similar)
  visualSimilarity: number; // 0..1 (higher = more similar)
  invariantPassed: boolean;
  reason?: string;
}
