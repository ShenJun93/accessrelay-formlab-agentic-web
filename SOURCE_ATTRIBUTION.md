# Third-party source and licensing

Browser runtime files at `formlab/runtime/` and `accessrelay/runtime/` are copied from:

- https://github.com/cognizant-ai-labs/agentic-web
- pinned source commit `7817c1f75b8d4f497c869540212be17dda94dcae`
- upstream runtime license: Apache License, Version 2.0

The published browser runtime is copied from the pinned upstream without modifying its implementation. The project's first-party additions include website shells, browser-local actions, network and policy definitions, receipt validators, tests and supporting documentation. The source-release candidate is prepared for distribution under the root Apache-2.0 license; upstream components retain their respective license notices. This is an independent entrant project, not an official Cognizant or W3C product. Any future runtime fork requires separate provenance and license checks.

A copy of the applicable license is distributed as `LICENSE` and within each bundled `runtime/LICENSE.txt`.
