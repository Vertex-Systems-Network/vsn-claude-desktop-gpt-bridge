# Authentication

DeskAgent uses the connected user's own eligible ChatGPT plan through the public SIWC contract. Live OAuth wiring is pending.

The main process will open the verified OpenAI authorization URL in the system browser and receive the callback through IPv4 loopback. Each attempt needs fresh state, nonce and PKCE. Validate the one-time callback, verify ID token signature and claims, and confirm granted scopes. Request `openid profile email offline_access resource.invoke chatgpt.tokens.use.direct` in line with the currently documented dynamic registration flow. Preserve the client ID and opaque installation ID across reconnects.

Windows credential encryption uses Electron safeStorage backed by DPAPI. The adapter fails when Windows protection is unavailable. DPAPI protects across Windows user accounts. Processes running as the same Windows user remain within the local trust boundary. Keep credentials in the main process, separate from conversation data and exports.

Refresh must preserve rotated tokens safely and distinguish transient failures from terminal revocation. A terminal invalid credential state must stop inference and require reconnect. Disconnect removes local credentials and reports whether provider revocation was confirmed. The renderer receives only displayable state.

The OpenAI DevKit packages are private npm workspaces in the official source repository. The DevKit Noncommercial License v1.0 restricts business and client use even if the app is free. Before incorporating SDK code, establish the applicable distribution path. For business use, obtain written SDK rights or assess an independently authored integration against the published direct protocol and SIWC terms.

- [DevKit setup](https://github.com/openai/sign-in-with-chatgpt-devkit)
- [DevKit license](https://github.com/openai/sign-in-with-chatgpt-devkit/blob/main/LICENSE)
- [SIWC terms](https://openai.com/policies/sign-in-with-chatgpt-terms/)
- [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)
