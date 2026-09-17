# CONVERGENCE — Donor Discovery Addendum (Deep-Dive Pass 2)

Companion to `docs/research/PERPLEXITY_DONOR_SEARCH.md`. This pass re-verified previously-flagged reference projects live via the GitHub API and searched for additional permissively-licensed candidates in the remaining gap areas. All data pulled live on 2026‑09‑17.

---

## New confirmed candidates (add to matrix)

| Repo | Activity | License | Confidence | Relevant subsystem | R1/R2/R3 | Recommendation |
|---|---|---|---|---|---|---|
| **`stalniy/casl`** | 7,080★, 301 forks, pushed same day as audit (2026‑09‑16), TypeScript | **MIT** | HIGH | Capabilities/permissions layer for the Control-Loss Matrix — "can the player issue directive class X" as a first-class ability check | R1/R2 | **Strong new addition.** This is a materially better fit than `json-rules-engine` specifically for the *capability revocation* half of Gap D: CASL's `AbilityBuilder`/`can`/`cannot` model maps almost directly onto "Financial containment → banking directive classes unavailable." Use CASL for capability gating, `json-rules-engine` for directive eligibility/interpretation logic — they are complementary, not redundant. |
| **`ondras/rot.js`** | 2,717★, 267 forks, pushed 2024‑11, updated as recently as 2026‑09‑14, 12+ years old | **BSD‑3‑Clause** | HIGH | Scheduler (Simple/Speed/Action scheduling) + seeded RNG — the exact role currently assigned to `idle-game-template` | R1/R2 | **Strong replacement candidate.** rot.js's `Scheduler` and `RNG` modules are dramatically more mature (12 years, thousands of users) than `idle-game-template`'s 1-day-old scheduler/RNG. Both are permissively licensed. Recommend evaluating rot.js's scheduler/RNG as the primary source for CONVERGENCE's tick orchestration instead of `idle-game-template`, keeping idle-game-template only for its save-envelope/offline-catch-up *pattern* (which rot.js does not provide, being a roguelike toolkit, not an idle-game template). |

## Corrections to prior audit notes

- **`Endgame: Singularity` (`singularity/singularity`) is not confirmed GPL.** Live GitHub metadata shows `license: other / NOASSERTION` — GitHub's classifier cannot resolve it to a standard SPDX license at all, which is a *stronger* blocker than a clean GPL classification would be (GPL is at least an unambiguous copyleft; NOASSERTION means "we can't tell and neither should you"). Conclusion is unchanged (do not use as code donor) but the reasoning should say "unresolved/non-standard license," not "GPL."
- **`Programaxis` (`marcus/programaxis`) is now independently confirmed MIT** via live GitHub API license metadata (2★, TypeScript, idle game with tech-tree progression, last updated 2026‑04‑02). The prior "must be reverified" flag can be downgraded to HIGH confidence / cleared.
- **`Synergism` resolves to `Pseudo-Corp/SynergismOfficial`**, confirmed MIT, 372★, 248 forks, very active (pushed 2026‑09‑16). This is a strong production reference for save/offline patterns in a large TypeScript incremental game, though note it is a web game — no independent evidence was found this pass that it ships through Capacitor specifically, so cite it for "mature large-scale incremental TS codebase" patterns, not for "proven Capacitor mobile shipping" claims.
- **`NGSpaceCompany`** confirmed MIT (`csonthejjas/NGSpaceCompany`, Vue, 6★). Notably there is a **separate native Android client** (`ilyaminichev/NGSpaceCompanyAndroid`, MIT, Java) — this is a real precedent for "Vue incremental game + mobile shell," but the mobile shell is native Java, not Capacitor, so it doesn't close Gap F either.
- **`davidbau/seedrandom`** (2,131★, BSD-style reputation, widely used) returned **no `license` field in GitHub's repository metadata** in this pass, despite common belief that it is MIT/BSD-licensed with a LICENSE file. Per the project's own license-hygiene policy ("do not infer permission from README/reputation when a canonical license file is absent"), this should be treated as **NEEDS MANUAL FILE-LEVEL VERIFICATION** before use, not assumed clean — even though it is an extremely widely-used package. This is exactly the kind of case the policy is designed to catch.
- **Kittens Game's canonical/official repository could not be conclusively located this pass** (searches returned only fan tools, forks, and unrelated same-named projects). The prior caution ("custom license, treat as reference only") should remain in force *specifically because it remains unverified*, not because it was reconfirmed.

## Gap search results (no strong new donor found)

- **Weighted event selection / effect composition (Gap B):** searched specifically; only result was a single-day-old, 0-star, unverified license library (`ts-weighted-sampler`). This portion of the systemic event engine is simple enough that hand-rolling it remains the right call — confirms Gap B stays **still-own-code**.
- **Headless skill/tech-tree engines as alternatives to `yggdrasil-forge`:** searched by topic; only 3 results existed, and `yggdrasil-forge` is the only game-oriented, headless-capable one among them (the others are an MCP capability-graph tool and an Age of Empires II data reference, both irrelevant). This *strengthens* the case for keeping `yggdrasil-forge`, despite its youth — there is no better-established alternative.
- **Capacitor + idle-game topic search:** rechecked; still only 4 total repositories exist with both topics, all 2026-created, ≤1★. Gap F conclusion (still-own-code, validate empirically on your own Android build) stands unchanged.

## Updated recommendation

Add **`stalniy/casl`** and **`ondras/rot.js`** to the top recommended additions from the base report, for a revised top-of-list:

1. `CacheControl/json-rules-engine` (ISC) — directive eligibility/interpretation rules.
2. **`stalniy/casl` (MIT) — capability/permission gating for the Control-Loss Matrix.** [new]
3. `statelyai/xstate` (MIT) — UI phase machine + per-channel Anomaly escalation states.
4. **`ondras/rot.js` (BSD‑3‑Clause) — evaluate replacing `idle-game-template`'s scheduler/RNG with rot.js's, given 12 years of maturity vs. 1 day.** [new]
5. `y-lohse/inkjs` (MIT) — unchanged, still the safest primary donor.

Everything else from the base report stands. The 80% reuse target remains unrealistic and should stay abandoned — this deeper pass found better *infrastructure* (rules, permissions, state machines, scheduling) but confirmed, again, that no donor exists for CONVERGENCE's actual defining mechanics.
