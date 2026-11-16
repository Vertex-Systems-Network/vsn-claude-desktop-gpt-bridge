# DeskAgent

A Windows desktop workspace in development. The current build includes the Windows account panel, explicit ChatGPT plan verification, runtime diagnostics and appearance controls. The chat workspace supports model selection and streamed text. Chat messages are saved in a local SQLite file under the Windows app data directory. Sign in to the same account registration to reopen recent chats. Local history is stored as readable SQLite text and does not sync to ChatGPT history.

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

In **Chat workspace**, choose **Load models**, select a model, and send a message. Recent completed turns are included in follow-up requests.

The smoke test launches Electron and verifies the built renderer's connection to the main process and a synthetic Windows credential encryption round trip. Run it in a Windows desktop session. See [feasibility](docs/FEASIBILITY.md), [progress](PROGRESS.md) and the [test report](TEST_REPORT.md).

Use **Search saved chats** to find a conversation by title or message text. Export the open conversation from **Export Markdown** or **Export JSON**. Choose a destination in the Windows save dialog.
