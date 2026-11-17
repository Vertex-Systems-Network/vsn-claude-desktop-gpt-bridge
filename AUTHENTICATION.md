# Authentication

DeskAgent uses the connected user's own eligible ChatGPT plan through the public SIWC contract. The Windows account panel uses an independently authored client against the documented SIWC endpoints. Live consent and account eligibility remain unverified.

The main process opens the verified OpenAI authorization URL in the system browser and receive the callback through IPv4 loopback. Each attempt needs fresh state, nonce and PKCE. Validate the one-time callback, verify ID token signature and claims, and confirm granted scopes. Request `openid profile email offline_access resource.invoke chatgpt.tokens.use.direct` in line with the currently documented dynamic registration flow. Preserve the client ID and opaque installation ID across reconnects.

Windows credential encryption uses Electron safeStorage backed by DPAPI. The adapter fails when Windows protection is unavailable. DPAPI protects across Windows user accounts. Processes running as the same Windows user remain within the local trust boundary. Keep credentials in the main process, separate from conversation data and exports.

Check session renews credentials near expiry on user request. Rotated credentials are stored before validating a replacement ID token. Automatic renewal during inference remains pending. Disconnect removes local credentials and attempts to revoke the renewable session with OpenAI. The interface reports unconfirmed revocation. One registration is currently supported per installation. The renderer receives only displayable state.

The OpenAI DevKit packages are private npm workspaces in the official source repository. The DevKit Noncommercial License v1.0 restricts business and client use even if the app is free. DeskAgent uses the public direct protocol with independently authored code and JOSE for signature verification. The DevKit is excluded from this integration.

- [Official registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [DevKit setup](https://github.com/openai/sign-in-with-chatgpt-devkit)
- [DevKit license](https://github.com/openai/sign-in-with-chatgpt-devkit/blob/main/LICENSE)
- [SIWC terms](https://openai.com/policies/sign-in-with-chatgpt-terms/)
- [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)

**Verify plan access** fetches the authenticated account catalog and sends one fixed prompt to the first visible model. The action uses plan allowance and completes only when the stream delivers a nonempty response and an official completion event. It sends no user documents, code or conversation text.
