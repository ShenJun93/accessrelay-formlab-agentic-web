# Portable Integrity Core (P768)

`portable-integrity.mjs` is a small, dependency-free, deterministic JSON/SHA-256 envelope module. The **same** generic verifier validates receipts from two deliberately distinct applications when supplied with their separate domain-specific validators:

- FormLab: `formlab-reversible-evidence/v1`, with a pinned external public accessibility policy, local DOM observations and user-approved Undo.
- Harbor Basket: `harbor-basket-evidence/v1`, with a first-party real fare quote, exact trip binding, observable basket state and separately approved removal.

The shared envelope uses `payload`, `integrity: {algorithm:"SHA-256", digest}`, and the existing FormLab-compatible `warning` field. The legacy FormLab generator itself remains unchanged for compatibility; the shared verifier's support is tested against its output.

Validation is fail-closed on missing fields, wrong schema, foreign-domain payloads, getters, invalid JSON values, wrong version progressions, changed observed targets, and hash mismatches. Hashes are reproducible and **do not confer authenticity** or establish that the event was genuinely witnessed.

To verify an existing downloaded file use `node dev/verify-portable-receipt.mjs <path>` from `prototype/`. Tests: `node --test shared/tests/*.test.mjs`.

This is a source-level prototype component, not a packaged library, trusted notarization service, accessibility certificate, or general framework for all agentic websites.
