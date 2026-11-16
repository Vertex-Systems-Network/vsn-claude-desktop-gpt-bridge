# DeskAgent

A Windows desktop workspace in development. The current build includes the Windows account panel, explicit ChatGPT plan verification, runtime diagnostics and appearance controls. Conversation history and the chat workspace are pending.

## Development

Use Node.js 24 and its bundled npm, matching Windows CI.

```powershell
npm install
npm run dev
npm run check
npm run build
npm run smoke
```

To try live plan verification, open the app, select **Continue with ChatGPT**, complete browser consent, then select **Verify plan access**. This sends a short fixed GPT request and uses the eligible account's plan allowance.

The smoke test launches Electron and verifies the built renderer's connection to the main process and a synthetic Windows credential encryption round trip. Run it in a Windows desktop session. See [feasibility](docs/FEASIBILITY.md), [progress](PROGRESS.md) and the [test report](TEST_REPORT.md).
