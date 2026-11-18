# FormLab + AccessRelay — Portable Trust Repair Kit

Public source for two static agentified websites demonstrating an explicit approval boundary, evidence-locked Apply/Undo and self-attested receipts.

**Canonical websites:** [FormLab](https://oaw-formlab-2026.vercel.app) and [AccessRelay](https://oaw-accessrelay-2026.vercel.app). This repository is a source release; verify the live deployments independently rather than treating a GitHub commit as deployment evidence.

## Zero-key walkthrough

Open FormLab and start the built-in demo. After explicit consent, its AccessRelay peer policy is fetched, inspected and approved. Apply a repair, then Undo it: the intentional accessibility findings return **3 → 2 → 3**. Export a JSON receipt and verify its SHA-256 integrity with the included CLI. No model key or payment is necessary. Do not enter real personal information.

The initial low-contrast helper-text finding is a deliberate repair fixture. Browser axe-core testing does not certify WCAG compliance. A receipt or source inventory hash is **self-attested**, not a digital signature or third-party proof that browser actions happened. Optional bring-your-own-key inference is not claimed as verified on this production release.

## Source and origins

- Release: P790; 116 static site assets, original candidate SHA-256 inventory: `fc7b7bcefa83b910fc2d7caa30ea467655cb0c6839104ae4562de18a7475cbfa`.
- Rule pack SHA-256: `60ba135536c3b93954b891e531c5db9e9b9bc1ee216630c99d5bc24750f364d0`.
- Original Cognizant runtime from `cognizant-ai-labs/agentic-web`, pinned to upstream commit `7817c1f75b8d4f497c869540212be17dda94dcae`. See `SOURCE_ATTRIBUTION.md` and the bundled license notices.
- Only a clean-source export is published; internal project history, credentials, QA browser state and Vercel settings are excluded.

FormLab and AccessRelay are separate HTTPS origins. Their policy, network peer allowlists and frontend bindings are compiled to those canonical hostnames. Regenerate the package when hostnames change; editing only the HTML links or manifest is insufficient.

## Verify with Node.js 22+

```sh
node verify-release.mjs
node --test shared/tests/*.test.mjs formlab/tests/*.test.mjs
node dev/verify-portable-receipt.mjs /path/to/receipt.json
```

`RELEASE_MANIFEST.json` hashes each public source file and the 116 website assets. You can reproduce its SHA-256 integrity offline; that does **not** independently authenticate the publisher or prove live production is serving those exact bytes.

The export includes the FormLab/AccessRelay demos and minimal Harbor basket receipt schema-verification dependencies, **not** the Harbor Tours website, reservation engine, payment systems or real booking capability.

## License and attribution

See `LICENSE`, `SOURCE_ATTRIBUTION.md` and the original runtime license notices. No endorsement by Cognizant, W3C, Devpost or other third parties is implied.
