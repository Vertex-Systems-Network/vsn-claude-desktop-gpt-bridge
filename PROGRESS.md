# Progress

Phase 0 research is documented. Phase 1 contains the desktop shell, native runtime diagnostics, typed preload IPC, Tailwind, Zustand, linting and a startup smoke test. Windows CI evidence is in the [test report](TEST_REPORT.md).

Phase 2 preparation includes a main-process Windows credential encryption adapter and a synthetic encryption check in the Electron smoke test. SDK incorporation and live OAuth remain pending. See [authentication](AUTHENTICATION.md).

The account panel and documented direct SIWC authorization flow now have implementation code. This includes a one-time IPv4 callback, PKCE, verified ID tokens, grant checks, DPAPI account records, interactive reconnect, and local sign-out with remote revocation reporting. Windows execution passed for the OAuth foundation. Live sign-in still needs an eligible account.

Account settings also include a user-initiated session renewal path with protected token rotation and interactive reconnect after terminal refresh errors.

The account panel can request the live visible-model list and verify plan access through a completed Responses stream. The chat workspace adds account-specific model selection, multi-turn text requests, live partial replies, cancellation, and session-only messages. Persistent history and live account testing remain pending.

Phase 4 adds versioned local SQLite history, recent-chat selection, account scoping, and recovery of interrupted replies. Local text search and Markdown/JSON export are implemented. Saved chats can be renamed, archived, restored or deleted. Temporary chats skip SQLite writes and are cleared on exit.

Phase 5 started with the Projects panel, local SQLite project CRUD, native folder selection, and persisted instructions. Conversation-level project selection now persists locally and includes the current instructions on send. Projects now have session-based read-only folder grants, folder navigation, and local text previews. A user can attach one supported text file from a granted project folder. The current file content is read when sending and used for that request only.

Phase 6 starts with a user-approved, one-shot local stdio MCP discovery panel. It shows tool names and descriptions and closes the connection. Saved server profiles persist names locally and protect executable paths and arguments with Windows DPAPI. Manual calls can run a discovered local tool with a per-call native confirmation and schema-checked JSON arguments. Text output stays in the MCP panel. Remote transports and chat integration remain pending.
