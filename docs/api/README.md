# DPTR API Reference

## Overview

The core repair entry point is `DPTRResolver`, which stores a baseline locating context for a selector and attempts a knowledge-guided repair when an action fails.

## Main types

### `OracleDecision`

`'HEAL' | 'REJECT_BUG' | 'UNKNOWN'`

Represents the decision outcome of a repair attempt.

### `LocatingContext`

```ts
export interface LocatingContext {
  originalSelector: string;
  tag: string;
  textContent: string;
  boundingBox: { x: number; y: number; width: number; height: number } | null;
  attributes: Record<string, string>;
  screenshotBuffer?: Buffer;
  templateMatchScore?: number;
}
```

### `OracleEvaluationResult`

```ts
export interface OracleEvaluationResult {
  decision: OracleDecision;
  confidenceScore: number;
  domDistance: number;
  visualSimilarity: number;
  invariantPassed: boolean;
  reason?: string;
}
```

## `DPTRResolver`

### Methods

#### `registerBaseline(selector, ctx)`
Registers a baseline for a selector.

#### `getBaseline(selector)`
Returns the stored baseline for a selector, if present.

#### `captureContext(page, selector)`
Captures the baseline context for a selector before a mutation occurs.

#### `tryRepairAndRun(page, selector, actionFnName, actionArgs)`
Attempts to repair a failed action by matching the best candidate against the baseline, scoring it, and either healing or rejecting the action.

## Example usage

```ts
import { test } from '@playwright/test';
import { DPTRResolver } from '../src/dptr-engine';

test('example', async ({ page }) => {
  const dptr = new DPTRResolver();

  await page.goto('https://example.com');

  await page.locator('#submit-btn').click();

  // if this fails, the fixture layer may delegate to dptr automatically
});
```

## Decision policy

The repair engine prefers these rules:

1. If the candidate is visually and semantically similar and passes invariants, heal.
2. If the candidate is ambiguous or visibly blocked, reject the repair.
3. If the evidence is insufficient, return UNKNOWN.

This preserves the product defect signal rather than masking it.
