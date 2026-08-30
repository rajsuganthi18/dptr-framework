# DPTR Framework

A prototype TypeScript + Playwright framework for defect-preserving self-healing GUI test automation. The system is designed around a conservative repair decision policy: when evidence suggests a real application defect, it should reject the repair instead of masking the problem.

## Purpose

This project focuses on a narrow but important research problem:

- AI-assisted self-healing GUI test automation
- online gaming platform interfaces
- defect-preserving repair decisions
- avoiding false healing when the UI appears legitimate but the product behavior is broken

The implementation remains intentionally scoped and evidence-driven. It is a research prototype rather than a production-ready test platform.

## Repository structure

```text
.
├── .github/
│   └── workflows/
│       └── ci.yml
├── docs/
│   ├── api/
│   │   └── README.md
│   └── examples/
│       ├── README.md
│       └── basic-heal.ts
├── src/
│   ├── core/
│   │   └── index.ts
│   ├── dptr-engine.ts
│   ├── dptr-fixture.ts
│   ├── dptr-types.ts
│   ├── invariant-verifier.ts
│   ├── visual-oracle.ts
│   └── dom-delta.ts
├── tests/
│   └── demo.spec.ts
├── .eslintrc.json
├── .gitignore
├── CONTRIBUTING.md
├── EVIDENCE.md
├── README.md
├── RESEARCH_SCOPE.md
├── package.json
├── tsconfig.json
└── playwright.config.ts
```

## Installation

1. Install dependencies:

   npm install

2. Install the browser runtime:

   npx playwright install chromium

## Common commands

```bash
npm run build
npm run typecheck
npm run lint
npm test
npm run test:demo
```

## Decision model

The framework classifies outcomes as:

- HEAL: the failure is consistent with legitimate UI evolution
- REJECT_BUG: the failure is likely a real defect and should be preserved
- UNKNOWN: the evidence is insufficient to justify repair

The design priority is to prefer uncertainty or bug rejection over unsafe healing.

## API and usage docs

- API overview: [docs/api/README.md](docs/api/README.md)
- Examples: [docs/examples/README.md](docs/examples/README.md)

## Evidence and honesty

This repository is intentionally honest about scope and maturity:

- the build currently compiles
- the demo suite is still a prototype and has not reached broad validation
- claims remain conservative and are documented in [EVIDENCE.md](EVIDENCE.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution expectations and project workflow.

## License

MIT
