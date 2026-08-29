# DPTR-framework

Prototype implementation of a Defect-Preserving Test Repair (DPTR) system using Playwright + TypeScript.

Setup

1. Install dependencies:

   npm install -D @playwright/test typescript @types/node pixelmatch pngjs

2. Install Playwright browsers:

   npx playwright install chromium

3. Run tests:

   npx playwright test

Files
- src/*: core implementation
- tests/demo.spec.ts: demonstration scenarios

Notes
- All visual diffing is performed with pngjs + pixelmatch. No external cloud services are used.
