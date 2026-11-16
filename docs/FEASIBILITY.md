# DeskAgent feasibility

Reviewed 17 November 2026. The supplied public repository was empty.

## Supported path

DeskAgent is the connected application. It runs on the user's Windows machine and uses the eligible user's authorized ChatGPT plan, with no additional charge by DeskAgent. OpenAI documents dynamic OAuth client registration tied to the user and workspace. Persist an opaque installation host ID before sign-in, keep credentials under user control and verify the account's actual grant and completed inference before reporting readiness.

The official cookbook demonstrates the Electron main-process integration with `@siwc/local`. Verify the released DevKit version, license and protected storage contract before pinning it. Publish DeskAgent under an open-source license before a public release. Public source visibility alone is not a license. Account and workspace eligibility can only be verified through a real sign-in and completed request.

Discover visible models from the OAuth-authenticated `GET https://api.openai.com/v1/models` catalog. Send `POST https://api.openai.com/v1/responses` using the authorized token with `store: false`, `stream: true` and the required local context. Wait for the completion event. The HTTP route does not support `previous_response_id`, hosted MCP, hosted image generation or Code Interpreter. Handle ineligibility, revocation and usage errors without changing billing.

## Claude Desktop routing

Blocked. OpenAI limits plan usage to the connected application. Anthropic describes Desktop MCP as a way to add tools and data sources. The reviewed materials contain no joint authorization to swap Claude Desktop's inference with GPT using the user's plan. DeskAgent proceeds as a standalone Electron app.

## Sources

- [OpenAI SIWC quickstart](https://developers.openai.com/siwc/quickstart)
- [OpenAI SIWC terms, section 3.1](https://openai.com/policies/sign-in-with-chatgpt-terms/)
- [ChatGPT plan usage overview](https://developers.openai.com/siwc/token-sharing-open-source)
- [Electron DevKit cookbook](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt)
- [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
- [Errors and recovery](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery)
- [Anthropic Claude Desktop MCP guide](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)
