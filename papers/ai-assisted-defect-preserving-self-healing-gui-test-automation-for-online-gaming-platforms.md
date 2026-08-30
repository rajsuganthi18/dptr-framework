# AI-Assisted Defect-Preserving Self-Healing GUI Test Automation for Online Gaming Platforms

## Abstract

Modern online gaming platforms present a particularly difficult environment for GUI test automation. Their interfaces are highly dynamic, stateful, asynchronous, and often governed by real-time client/server interactions. A test that fails may reflect a legitimate UI evolution, or it may reveal a genuine product defect. This distinction is central to test maintenance and software reliability. Existing self-healing GUI testing approaches often focus on repairing a broken locator or making the test pass, but they do not reliably distinguish between harmless UI evolution and real application faults. This is especially problematic in gaming platforms where a false repair can hide a broken reward flow, navigation path, matchmaking transition, or purchase state update.

This paper introduces a defect-preserving self-healing GUI testing approach for online gaming platforms. The work is grounded in the existing DPTR (Defect-Preserving Test Repair) concept, which makes a repair decision not only on locator similarity but also on whether the failure is likely to represent a genuine UI change or a genuine application defect. We extend the concept to gaming-specific UI conditions including delay-sensitive state transitions, transient overlays, dynamic achievement or reward widgets, leaderboards, and asynchronous client/server state changes. The proposed framework classifies outcomes as HEAL, REJECT_BUG, or UNKNOWN, and it explicitly prefers uncertainty over false repair when the evidence is ambiguous.

The paper argues that the key research problem is not merely whether a test can be automatically repaired, but whether the repair decision preserves the application defect signal. We propose a framework that combines DOM similarity, visual similarity, state-aware semantic checks, behavioural validation, and invariant verification. We further define experiments for legitimate UI changes and genuine defects and propose metrics including False Healing Rate, Defect Preservation Rate, and Correct Healing Rate. This research direction is designed to remain technically grounded in software testing and automation while making the DPTR concept more relevant, defensible, and publishable for online gaming platforms.

---

## 1. Introduction

GUI test automation is indispensable for modern software systems, yet it remains brittle in the face of interface evolution. A common failure mode is that a selector stops matching, a layout shifts, or a visually equivalent control changes semantics. In standard web applications, many self-healing techniques are effective because the UI is relatively structured and the state transitions are comparatively predictable. In online gaming platforms, the problem is harder. The UI is often stateful, real-time, animated, and driven by asynchronous server events. The same visual element may exist in multiple semantic contexts. The same failure may result from UI evolution or from a genuine product defect.

This distinction matters. A test repair system that simply makes the test green without asking whether the bug is real is dangerous. It can hide defects in reward systems, progression flows, purchase logic, matchmaking, inventory updates, lobby transitions, or combat state changes. In games, these are not minor issues; they affect playability, fairness, and trust in the product.

This paper builds on the existing DPTR concept, which is explicitly designed around defect preservation rather than blind repair. The central idea is that a self-healing system should distinguish between:

1. a legitimate GUI/UI change that should be healed, and
2. a genuine application defect that should not be healed.

Existing DPTR-style prototypes already embody this principle with notions such as DOM similarity, visual similarity, invariants, candidate scoring, and a decision space including HEAL, REJECT_BUG, and UNKNOWN. The research contribution in this paper is to adapt and strengthen this concept for online gaming platforms, where dynamic state and real-time UI actions make the decision boundary significantly more complex.

The motivation for this work is not to create a generic game-testing framework, nor to drift into game analytics or game AI. The motivation is to improve the scientific rigor of self-healing GUI test automation for a domain with unusually high risk from false repairs. The research question is therefore not simply “can a test be healed?” but “can the system correctly determine whether it should heal, reject, or abstain?”

---

## 2. Background and Motivation

### 2.1 GUI Test Automation and Fragility

GUI test automation relies on reliable selectors and stable interaction models. Traditional automation frameworks such as Playwright, Cypress, and Selenium assume that elements remain identifiable and semantically consistent. In reality, software interfaces evolve frequently. A button ID may change, text may be updated, a control may move into a different container, or a screen may be restructured while preserving functional behavior.

When such changes occur, a brittle automation suite fails. The maintenance cost of updating selectors and assertions becomes significant. Self-healing GUI testing attempts to reduce this burden by automatically identifying a replacement target and re-running the action.

### 2.2 Why Online Gaming UI Is Different

Unlike a typical enterprise web app, an online gaming platform often contains:

- highly dynamic game state
- asynchronous UI transitions
- timers and countdown components
- transient overlays and pop-ups
- dynamic leaderboards or reward widgets
- state-dependent actions
- server/client synchronization effects
- layered or animated UI regions
- frequent UI re-rendering during gameplay or social features

These conditions create a much harder testing scenario. The same button may be represented by multiple variants depending on whether the player is in a lobby, in-game state, reward state, or progression state. A selector may look similar yet not be semantically equivalent. A UI repair that appears to work could still be recovering the wrong element or hiding a broken action.

### 2.3 The Defect-Preservation Principle

The core principle of DPTR is that a repair system should not be judged solely on whether it makes a test pass. Instead, it should be judged on whether it correctly distinguishes legitimate UI evolution from real product defects. This principle is especially important in online gaming environments because false repairs may not be visible as ordinary test failures; they may silently allow broken progression, missing rewards, or invalid game actions to persist in the product.

This yields a more precise decision model:

- HEAL: the observed failure is consistent with UI evolution and the new element can be validated.
- REJECT_BUG: the underlying failure is likely a genuine defect and the test should fail rather than be repaired.
- UNKNOWN: there is not enough evidence to decide; abstention is safer than a risky repair.

This is the conceptual foundation of the proposed research.

---

## 3. Related Work

### 3.1 Self-Healing GUI Testing

Several lines of work address repair of broken DOM locators and visual mismatches. Classical approaches use heuristic matching between baseline and current DOM states, often combining tag names, IDs, CSS classes, text, and relative position. More recent work explores visual similarity, semantic matching, and candidate ranking.

These approaches are useful, but they mostly optimize for locating a replacement element. They are generally less concerned with whether the repaired element is semantically correct or whether the system is masking a real bug.

### 3.2 AI-Assisted Test Automation

AI and LLM-based approaches are increasingly used for UI understanding, test generation, and test repair. They can assist with semantic interpretation of pages and generate natural-language reasoning over selectors and controls. However, such systems often retain a weak notion of truth when used as the sole oracle. They may produce plausible but invalid repairs because they optimize for plausibility rather than correctness.

This limitation matters more in difficult domains like gaming UIs, because the required evidence is not just “what looks similar?” but “what is the correct semantic action in this state?”

### 3.3 GUI Test Oracles and Defect Detection

The test oracle problem remains a central challenge in software testing. Traditional oracles validate expected assertions, while more advanced approaches use snapshots, behavioral invariants, visual comparisons, or state-transition checks. These are useful in self-healing systems, but they are often not integrated with a repair decision in a principled way.

The gap is most visible when a failed UI action is not due to stale locators but due to a product bug. Many frameworks fail by treating repair as a single optimization goal rather than as a decision about correctness.

### 3.4 Game Testing and Game UI Validation

Game testing literature has investigated graphics validation, gameplay logic, state management, and scene transitions. However, the specific problem of self-healing GUI tests for online game platforms remains relatively underexplored. This is not because the problem is unimportant, but because the assumptions behind generic web self-healing do not transfer cleanly to game-specific UI dynamics.

Many gaming interfaces are not simple DOM trees. They include overlays, queues, loading screens, reward banners, animated components, and stateful transitions that depend on server responses. These conditions complicate both candidate discovery and oracle validation.

### 3.5 Research Gap

The literature has largely solved the problem of finding a candidate replacement element in stable and moderately dynamic interfaces. What remains underexplored is the more difficult judgment problem: deciding whether the candidate should be repaired or rejected because the failure is a genuine defect. That is the gap this paper addresses.

---

## 4. Research Problem

The central research problem is:

> Can AI-assisted self-healing GUI test automation reliably repair tests when an online gaming UI changes while avoiding the masking of genuine application defects?

This question is deliberately framed around correctness, not merely around pass rate. The research problem is therefore not “can we find a locator?” but “can we determine whether the failure is due to a legitimate UI evolution or a real defect?”

The hypothesis is that a defect-preserving self-healing strategy can improve correctness in online gaming interfaces by combining:

- DOM similarity
- visual similarity
- element-level invariants
- semantic similarity
- state-aware reasoning
- behavioural verification
- candidate confidence scoring
- abstention when evidence is weak

The key outcome is not only improved healing of legitimate changes, but a substantial reduction in false healing and defect masking.

---

## 5. Research Questions

This paper addresses the following research questions:

1. How can a self-healing GUI framework reliably repair legitimate online gaming UI changes while preserving the signal of genuine defects?
2. What additional signals beyond DOM and visual similarity are necessary to distinguish UI evolution from product defects in dynamic gaming interfaces?
3. Does a defect-aware self-healing approach reduce false healing compared with simple heuristic repair?
4. What is the trade-off between repair coverage and defect preservation?
5. Under what conditions should the system abstain with UNKNOWN rather than heal aggressively?

---

## 6. Proposed Framework

The framework begins with the existing DPTR concept and extends it with gaming-specific checks that reduce false healing. The architecture is intentionally realistic and implementable without over-engineering.

### 6.1 Baseline Capture

The system captures baseline context for a critical selector or interaction target, including:

- tag and role
- text content
- attribute map
- bounding box
- screenshot buffer
- optional semantic context such as screen, state, or mode

This baseline becomes the reference for future decisions.

### 6.2 Candidate Discovery

When the original locator fails, the system searches the page for plausible replacements. This includes:

- same tag or role-based matches
- button/action-like elements
- text-based candidates
- visually similar elements
- candidates in nearby layout regions

The aim is not to find any likely replacement, but a ranked set of candidates that merit deeper validation.

### 6.3 Multi-Signal Scoring

Each candidate is scored using multiple signals:

- DOM similarity
- visual similarity
- layout and bounding-box proximity
- text similarity
- attribute similarity
- semantic compatibility with the original action
- state compatibility with the current game screen

The exact weighting is tuned to avoid over-repairing ambiguous cases.

### 6.4 Invariant and Behavioural Verification

A candidate is not accepted solely because it looks similar. It must satisfy invariants such as:

- visible and clickable
- not obscured by overlays
- not blocked by pointer events or hidden layers
- semantically plausible for the original action
- compatible with the expected state transition

This is where the framework becomes defect-aware rather than simple locator-repair driven.

### 6.5 Decision Layer

The decision engine outputs one of three values:

- HEAL: evidence supports a legitimate UI change; repair accepted.
- REJECT_BUG: evidence indicates a real product defect; preserve the failure.
- UNKNOWN: evidence is insufficient; refuse to repair.

The critical design choice is to prefer UNKNOWN or REJECT_BUG over a risky repair. This is the key difference between a naïve self-healing algorithm and a defect-preserving one.

### 6.6 Gaming-Specific Extensions

The gaming extension adds the following checks:

- game-state context: lobby, reward screen, leaderboard, match queue, inventory screen
- asynchronous delay handling: waiting for UI animations or state propagation
- transient overlay detection: popup blockers, reward banners, loading screens
- state-transition validation: ensure the action actually changes the expected game state
- reward/navigation validity checks: ensure the correct screen and correct backend event occur

These additions are justified because they directly address the reasons self-healing fails in online gaming UIs.

---

## 7. Experimental Design

The empirical evaluation is designed to compare three systems:

### Baseline 1: Traditional automation without self-healing

This baseline reflects the standard failure mode in a changing UI. When the selector breaks, the test fails and must be manually repaired.

### Baseline 2: Simple heuristic repair

This baseline uses a simple matching strategy based on tag, text, class, or nearest region. It is intended to represent the common rule-based self-healing approach.

### Proposed approach: AI-assisted defect-aware self-healing

This system uses the DPTR-inspired architecture with state-aware checks and a conservative decision boundary.

### Mutation Categories

The benchmark should include controlled UI changes and controlled defects.

#### Legitimate UI changes

- ID rename
- class change
- text update
- DOM restructuring
- element movement
- styling updates
- dynamic render changes
- close-but-valid visual alterations

#### Genuine defects

- blocked or obscured element
- removed event handler
- incorrect action behavior
- invalid navigation
- incorrect state transition
- broken rewards or progression update
- invalid leaderboard update
- server/client mismatch

### Experimental Conditions

The benchmark should vary across:

- game state
- timing and delay conditions
- dynamic overlay conditions
- static vs. dynamic layouts
- different UI screens and flows

This ensures the evaluation reflects realistic online gaming behavior rather than a single simplistic page.

### Expected Outcomes

The experiment should determine whether the proposed approach:

1. successfully heals legitimate UI changes,
2. rejects genuine defects,
3. avoids false healing,
4. reduces maintenance effort,
5. appropriately abstains in ambiguous cases.

---

## 8. Metrics

The most informative metrics are those aligned with the central defect-preservation theory.

### 8.1 Healing Success Rate

Proportion of legitimate UI updates repaired successfully.

### 8.2 Correct Healing Rate

Proportion of valid repairs that are both successful and semantically correct.

### 8.3 False Healing Rate

Proportion of genuine defects that were incorrectly healed. This is the highest-priority metric for this project because it directly measures the risk of masking real bugs.

### 8.4 Defect Preservation Rate

Proportion of genuine defects that were rejected and therefore preserved as failing tests.

### 8.5 Precision and Recall

Precision measures how often a repaired case was truly valid; recall measures how often valid repairs were found.

### 8.6 Maintenance Effort

Measures the manual effort introduced by test failures and repair work. This can include number of test failures, number of manual changes, and time-to-fix.

### 8.7 Time to Repair

How long the system takes to decide and repair or reject a failing test.

### 8.8 Test Execution Overhead

Additional execution cost introduced by candidate discovery, visual comparison, and state validation.

### Primary Metric

The primary metric should be False Healing Rate (FHR).

This is the most defensible primary metric because it captures exactly the central risk behind the project: a self-healing system that merely makes tests pass without preserving the defect signal is not useful in safety-critical or revenue-critical gaming flows. In online game systems, a false heal is not just a minor maintenance problem; it can obscure a serious defect in gameplay or monetization logic.

---

## 9. AI and Automation: What Is Actually Needed?

This project should not overclaim AI. The core contribution is not “a general AI system for game testing.” The contribution is a defect-aware test repair framework.

### 9.1 When an LLM is useful

A lightweight AI or semantic component can be valuable for:

- ranking candidate elements when several similar matches exist
- interpreting text or semantics when DOM is weak
- summarizing uncertainty and repair rationale
- helping with ambiguous cases where a rule-based system lacks evidence

### 9.2 When simpler methods are better

A rule-based and explainable scoring system is often more scientifically defensible because it is:

- deterministic
- auditable
- explainable
- easier to reproduce
- easier to evaluate in experiments

The stronger design is not to depend on the LLM for the final decision. The LLM should be an optional semantic assist, not the decision authority.

This is especially true in a research contribution intended to be rigorous and publishable. A sound scientific narrative is easier to defend when the primary oracle is explicit and explainable.

---

## 10. Threats to Validity

This research has several threats that must be addressed openly.

### 10.1 Benchmark Representativeness

A synthetic benchmark may not capture all dynamic behaviors of real online game platforms.

### 10.2 Timing Sensitivity

Gaming UIs are heavily affected by timing, server latency, and asynchronous state transitions. This can make results sensitive to runtime conditions.

### 10.3 Mutation Design Bias

A manually designed mutation set may not reflect all real-world UI evolution patterns.

### 10.4 Generalizability

Results may vary across game genres, screen types, and UI frameworks.

These limitations should be acknowledged in the paper and mitigated with a benchmark designed to capture realistic UI variants and a clear experimental protocol.

---

## 11. Expected Contributions

This work contributes in the following ways:

1. A defect-preserving self-healing model for stateful, dynamic gaming UIs.
2. A framework that distinguishes legitimate UI evolution from genuine defects.
3. A conservative decision policy that prefers UNKNOWN or REJECT_BUG over risky healing.
4. A realistic evaluation of false healing and repair correctness in a gaming context.
5. A methodologically stronger alternative to naïve self-healing that optimizes for correctness rather than green tests alone.

This is a meaningful research contribution because it targets not a generic UI problem, but a specific and under-explored failure mode in online gaming UI automation.

---

## 12. Conclusion

This paper argues that the most important problem in self-healing GUI testing is not whether a test can be repaired, but whether it should be repaired. In online gaming platforms, where UI state is highly dynamic and false repairs can hide significant defects, this distinction is essential. The proposed DPTR-inspired extension creates a defect-aware framework for online gaming interfaces, balancing healing with defect preservation and uncertainty management.

The resulting research direction remains faithful to the original technical focus: AI-assisted self-healing GUI test automation for online gaming platforms. It improves the concept by making it more rigorous, more relevant to the gaming domain, and more defensible as a publishable research contribution.

---

## Appendix A: Example Decision Logic

A simplified oracle decision can be represented as follows:

- If DOM similarity is high, visual similarity is high, and the candidate passes invariant and behaviour checks, then HEAL.
- If the best candidate fails invariants, is obscured, or triggers inconsistent state transitions, then REJECT_BUG.
- If the evidence is mixed, ambiguous, or inconsistent across state and timing conditions, then UNKNOWN.

This update is deliberately conservative and is more appropriate for online gaming systems than an aggressive repair policy.

---

## Appendix B: Suggested Future Experiments

Future work should expand this into a more complete benchmark by including:

- additional game screens and reward flows
- more extensive async timing conditions
- deeper state-machine validation
- broader use of backend API verification
- comparative evaluation of rule-based, semantic, and LLM-assisted repair strategies

The goal is not to overfit a single demo or web app but to build a benchmark whose findings are credible and reproducible.
