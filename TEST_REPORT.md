# Test report

## Windows verification

The [verified run](https://github.com/Vertex-Systems-Network/vsn-claude-desktop-gpt-bridge/actions/runs/43975672040) on `db49893` passed lint, type checking, 13 Vitest cases, the production build and the Electron smoke test. The smoke test launched on Windows, checked renderer account IPC and checked a synthetic Windows DPAPI credential round trip.

Earlier runs exposed an npm 10 internal dependency resolution crash and a CommonJS import lint error. The fixes were to use Node 24 with its bundled npm and convert the launcher to ESM. [Install failure](https://github.com/Vertex-Systems-Network/vsn-claude-desktop-gpt-bridge/actions/runs/43975145300) · [Lint failure](https://github.com/Vertex-Systems-Network/vsn-claude-desktop-gpt-bridge/actions/runs/43975439452)

## Live verification

The plan-check suite uses test responses for catalog filtering, OAuth request shape, split streaming frames, incomplete streams and provider errors. Live authorization requires an eligible account, browser consent and a completed real response. No live account, installer or final acceptance case has been verified.

The [plan verification run](https://github.com/Vertex-Systems-Network/vsn-claude-desktop-gpt-bridge/actions/runs/43976218127) passed 18 tests, the production build, and the Windows smoke test. Chat coverage adds completed context, interruption, incremental output, and enforcement of account model selection. Live ChatGPT consent and inference are separate from these fixture tests.

The [streaming chat run](https://github.com/Vertex-Systems-Network/vsn-claude-desktop-gpt-bridge/actions/runs/43977310518) passed all 22 tests and the Windows smoke test. Phase 4 adds a file-backed SQLite reopen test and a native SQLite round trip in the Windows smoke test.

The [SQLite reopen run](https://github.com/Vertex-Systems-Network/vsn-claude-desktop-gpt-bridge/actions/runs/43978630120) passed lint, type checks, all 23 tests, the production build, and the Windows SQLite/IPC/DPAPI smoke test. The search/export follow-up adds literal search and export-format fixtures.

The [search and export run](https://github.com/Vertex-Systems-Network/vsn-claude-desktop-gpt-bridge/actions/runs/43978864814) passed 24 tests and the native Windows smoke test. Lifecycle coverage adds version 1 migration, account-scoped rename/archive/restore/delete, and temporary inference with zero saved conversations.

The [chat lifecycle run](https://github.com/Vertex-Systems-Network/vsn-claude-desktop-gpt-bridge/actions/runs/43985246539) passed 27 tests and the native Windows smoke test. Projects adds a SQLite reopen/CRUD test and a renderer-to-main Projects IPC check in the native smoke test.

The first Projects run reached TypeScript and found a SQLite row type assertion error. The project record now uses the same structural type pattern as the other SQLite records.
