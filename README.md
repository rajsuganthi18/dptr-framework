# DPTR-framework

This repository holds a research prototype for a defect-preserving self-healing GUI test repair framework, aligned to the final paper:

"Toward Defect-Preserving Self-Healing GUI Test Automation for Real-Time Online Gaming Platforms: A Conservative, Multi-Signal Repair-Decision Framework"

## Scope

This repository is intentionally kept narrow and aligned to the final research direction:

- AI-assisted self-healing GUI test automation
- online gaming platforms
- defect-preserving repair
- false healing / defect masking as the research problem
- software testing and automation, not generic game AI or analytics

## Core files

- src/dptr-engine.ts: DPTR repair engine and decision gate
- src/dptr-fixture.ts: Playwright fixture integration
- src/dptr-types.ts: oracle and context types
- src/invariant-verifier.ts: runtime invariant checks
- src/visual-oracle.ts: visual similarity and template matching helper
- tests/demo.spec.ts: demonstration scenarios
- papers/ai-assisted-defect-preserving-self-healing-gui-test-automation-for-online-gaming-platforms.md: final paper draft

## Evidence and honesty

This project is a research prototype and not yet a validated publication-grade implementation.

The repository intentionally maintains honest evidence in:

- EVIDENCE.md
- RESEARCH_SCOPE.md

## Setup

1. Install dependencies:

   npm install

2. Install Playwright browsers:

   npx playwright install chromium

3. Run the prototype suite:

   npx playwright test

## Important note

The current code and tests are intentionally limited to the prototype scope described in the paper. Claims in the paper are kept conservative and aligned to what the repository currently demonstrates.
