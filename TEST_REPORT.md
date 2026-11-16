# Test report

## Windows verification

The [verified run](https://github.com/Vertex-Systems-Network/vsn-claude-desktop-gpt-bridge/actions/runs/43975672040) on `db49893` passed lint, type checking, 13 Vitest cases, the production build and the Electron smoke test. The smoke test launched on Windows, checked renderer account IPC and checked a synthetic Windows DPAPI credential round trip.

Earlier runs exposed an npm 10 internal dependency resolution crash and a CommonJS import lint error. The fixes were to use Node 24 with its bundled npm and convert the launcher to ESM. [Install failure](https://github.com/Vertex-Systems-Network/vsn-claude-desktop-gpt-bridge/actions/runs/43975145300) · [Lint failure](https://github.com/Vertex-Systems-Network/vsn-claude-desktop-gpt-bridge/actions/runs/43975439452)

## Live verification

The plan-check suite uses test responses for catalog filtering, OAuth request shape, split streaming frames, incomplete streams and provider errors. Live authorization requires an eligible account, browser consent and a completed real response. No live account, installer or final acceptance case has been verified.
