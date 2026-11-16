# Decisions

- ADR-001. DeskAgent runs as a standalone Windows Electron app. OpenAI plan requests originate in the connected desktop process. See [feasibility](FEASIBILITY.md).
- ADR-002. Main owns privileged operations. Renderer gets narrowly named capabilities through a sandboxed preload. Use one shared contract and validate inputs at main-process entry points.
- ADR-003. Use the documented SIWC route. Verify the DevKit version, license and Windows storage behavior before enabling account access.
- ADR-004. Plan for per-user SQLite history. The renderer must request data through IPC. Authentication credentials belong in a separate Windows-protected store.
