# AccessRelay + FormLab - Reversible Agentic Websites

Two independent browser-native agentic websites. Their 107 public static assets are byte-for-byte aligned with the reviewed P775 production release. This stand-alone repository has a fresh public Git history, with no imported internal Bounty Hub commits, secrets, logs or QA worktrees.

**Live applications:** [FormLab](https://oaw-formlab-2026.vercel.app) and [AccessRelay](https://oaw-accessrelay-2026.vercel.app).

**What is verifiably working without an API key:** public agent network discovery between HTTPS origins, explicit consent before a read-only independently published accessibility policy, SHA-256 binding, browser-local label-fix preview, separate manual Apply and Undo approvals, restoration observation, and a privacy-minimal **self-attested** JSON receipt. This is a deliberately narrow demonstration, **not a WCAG audit, cryptographic signature, or free hosted LLM inference**.

**Model-powered mode:** The official Cognizant browser runtime supports an optional visitor-chosen OpenAI-compatible provider and Bring-Your-Own-Key (BYOK). No provider credential or free hosted model is included. Real local model inference was separately measured during development, not a guarantee that your own provider/key will work. Don't type personal data or secrets into public demos.

## Directory layout

- `formlab/` — exact public static FormLab network, runtime, HTML and browser-local actions
- `accessrelay/` — exact public static peer agent network, policy rules and browser runtime
- `shared/portable-integrity.mjs` — dependency-free canonical JSON / SHA-256 receipt envelope
- `dev/verify-receipt.mjs` — offline FormLab JSON verifier
- `dev/verify-portable-receipt.mjs` — schema-dispatched offline FormLab + Harbor Basket receipt verifier
- `harbor-receipt/evidence/` and `harbor-receipt/js/` — **minimal validation dependencies only** for the second receipt schema; no Harbor website, payment, booking service or production site is included
- `shared/tests` and `formlab/tests` — selected open unit and integrity tests
- `RELEASE_MANIFEST.json` — per-file SHA-256, production origins and upstream provenance (self-attested snapshot, NOT a signed artifact)

## Test (Node.js 22+; no npm install)

```shell
node --test shared/tests/*.test.mjs formlab/tests/*.test.mjs
node dev/verify-portable-receipt.mjs /path/to/your-own-downloaded-receipt.json
```

The second command accepts only self-attested FormLab or Harbor schema payloads. A PASS validates the bounded schema and an internal integrity hash, **not** authenticity or that an event occurred.

## Publish and run

Both `formlab/` and `accessrelay/` are **ready-made static directory roots** with the exact production URLs embedded in manifests and compiled network definitions. They were built from source using Cognizant's official pinned network compiler. Each directory contains an independent Vercel `vercel.json` and Netlify-style `_headers` for public JSON CORS and sandbox CSP. They are not one shared-origin SPA.

To modify domains, **do not merely rewrite the public manifests**: regenerate both HOCON graphs, peer allowlists, links, site JavaScript and headers with the source project's verified `dev/p772-package-static.mjs` and the upstream Cognizant compiler pinned below. This export represents **exact public release bytes**; the development bundler and internal deployment receipts are intentionally not included.

License: Apache License 2.0. Original upstream browser runtime is copied unchanged from https://github.com/cognizant-ai-labs/agentic-web at commit `7817c1f75b8d4f497c869540212be17dda94dcae`. See `SOURCE_ATTRIBUTION.md` and each `runtime/LICENSE.txt`. Maintainers' FormLab/AccessRelay shells and example receipts are a separate addition; this repository is not an official Cognizant, W3C, Mozilla, or Devpost project and claims no endorsement.

**Public source:** https://github.com/ShenJun93/accessrelay-formlab-agentic-web. This new repository was seeded exclusively from a reviewed, allowlisted clean-source snapshot. See `RELEASE_MANIFEST.json` for reproducible source-byte evidence. The manifest is self-attested, not an independent publisher signature.

## Verify the pinned source snapshot

Run `node verify-release.mjs` from this directory. It verifies every exported file against RELEASE_MANIFEST.json and recomputes the 107-file public-site bundle digest. This is byte-integrity evidence, not a publisher signature or authentication.
