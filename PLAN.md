# DeskAgent implementation plan

Electron main owns authentication, inference, storage, and permissions. The sandboxed preload connects React to a narrow typed IPC surface. Use Vite for builds, Vitest for isolated tests, and a real Electron smoke test for startup.

Follow phases 0 through 12 in specification order. The Windows shell and IPC gate precede SIWC integration. Access to an eligible account and consent is required for live verification. SQLite, workspaces, client-side MCP and coding tasks follow the live chat foundation. The Windows release requires installer evidence and the acceptance audit.

See [requirements](docs/REQUIREMENTS.md) and [blockers](BLOCKERS.md).
