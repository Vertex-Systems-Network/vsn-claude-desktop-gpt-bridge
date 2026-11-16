# DeskAgent

A Windows desktop workspace in development. The current build opens a local shell with runtime diagnostics and appearance controls. The design targets authorized ChatGPT plan inference and local conversation history.

## Development

Use Node.js 22.12 or later in the 22.x line and npm.

```powershell
npm install
npm run dev
npm run check
npm run build
npm run smoke
```

The smoke test launches Electron and verifies the built renderer's connection to the main process and a synthetic Windows credential encryption round trip. Run it in a Windows desktop session. See [feasibility](docs/FEASIBILITY.md), [progress](PROGRESS.md) and the [test report](TEST_REPORT.md).
