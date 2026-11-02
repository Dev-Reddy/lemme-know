# Lemme Know

A private, single-tool MCP server that sends an SMS to its owner when an agent finishes or needs attention. Runs as a Node.js Vercel Function using the official MCP SDK and Streamable HTTP.

## Connect Claude

1. Open **Customize → Connectors → Add custom connector**.
2. Name it **Lemme Know** and enter `https://lemme-know.devreddy7.in/mcp`.
3. Select **No sign in** and add a fixed request header:
   - Name: `Authorization`
   - Value: `Bearer <your MCP_AUTH_TOKEN>`
4. Add the connector and enable its tool for your chat. Allow the notification tool to run when requested.

The header value is a secret. On the setup machine, find `MCP_AUTH_TOKEN` in the ignored `.env.local`. The Twilio credentials are separate and must never be added to Claude. If your Claude UI does not expose request headers, use a client supporting bearer headers; do not put credentials in the endpoint URL.

Suggested instruction for Claude:

> When you finish this task, or need my input before continuing, call `notify_agent_done` once before your final reply. Do not send repeated notifications for the same pause.

This is a tool the agent must call. It does not independently monitor the agent, detect crashes, or run after a forcibly terminated session.

## Tool

`notify_agent_done` takes no arguments and sends:

> Lemme Know: Your agent has finished working or needs your attention. It is ready for you.

The recipient, sender, and message cannot be selected by the caller. Successful results include a Twilio message SID and status. A `queued` or `sent` status is not proof of delivery. Check Twilio Messaging logs for final delivery status.

## Configuration

Copy `.env.example` to `.env.local`, fill in the values, and use a cryptographically random bearer token of at least 32 characters (for example `openssl rand -hex 32`). Keep all five variables server-side:

| Variable | Purpose |
| --- | --- |
| `MCP_AUTH_TOKEN` | Private credential required for every MCP request |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio API auth token |
| `TWILIO_FROM_NUMBER` | SMS-capable Twilio sender, E.164 format |
| `TWILIO_TO_NUMBER` | Your verified mobile number, E.164 format |

In Vercel these are sensitive Production environment variables. Preview deployments are intentionally not given SMS credentials. Rotate `MCP_AUTH_TOKEN` and redeploy to revoke connector access, then update the Claude header.

Twilio **trial account live credentials** can send real SMS to verified recipients subject to account, country, balance, and carrier restrictions. Twilio **test credentials** simulate requests and never deliver real SMS. Enable the appropriate geographic permissions for the recipient if required.

## Develop and verify

Requires Node.js 22.

```sh
npm ci
npm test
npm run dev
```

In another terminal:

```sh
# Initialize MCP and list tools without sending a text.
npm run smoke

# Actually send one notification (may incur Twilio charges).
npm run smoke -- https://lemme-know.devreddy7.in/mcp --send
```

Deploy through the linked GitHub repository or the Vercel CLI. Environment changes require a new deployment. `GET /` exposes public service metadata; `/mcp` requires the bearer token, including initialization and tool discovery. Missing/weak server auth configuration fails closed. Browser Origin requests are rejected.

The endpoint has no global rate limit or deduplication store. Anyone holding the bearer token can trigger repeated SMS charges. Keep it private and configure Twilio account usage alerts as desired. The server does not retry ambiguous Twilio requests automatically, because doing so may send duplicates.

## References

- [Claude custom connectors and request-header authentication](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
- [Official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Vercel Node.js Functions](https://vercel.com/docs/functions/runtimes/node-js)
- [Twilio test credentials](https://www.twilio.com/docs/iam/test-credentials)
