# Requirements and release gates

| Phase | Required evidence |
| --- | --- |
| 0 | Official plan contract and eligibility documented |
| 1 | Type check, unit tests, built renderer, native Windows IPC round trip |
| 2–3 | Real OAuth consent, verified scopes, live model list and completed stream |
| 4–5 | Restart restores history and projects. File boundaries and temporary history verified |
| 6–7 | Approved MCP round trip and approved repository changes, including denial and recovery tests |
| 8–10 | Complete workflows, accessibility, security and regression coverage |
| 11–12 | Windows x64 installer, clean install and uninstall tests, checksums and final audit |

Acceptance IDs AT-001 through AT-020 are defined by the master specification. Passing a foundation smoke test does not satisfy the installer or live-account acceptance tests.
