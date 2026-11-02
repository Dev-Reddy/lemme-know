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

> For this task in this chat, I explicitly opt in to SMS notifications. Only after a long-running, substantial task finishes or becomes blocked, wait at least one minute. If I have not replied during that minute, call `notify_agent_done` once with a short explanation of the outcome or blocker, using at most 122 plain English characters. Do not text for short tasks, every chat turn, routine questions, progress updates, or immediate urgent requests. If I reply during the wait, do not text. Only call if you can actually observe the elapsed time and absence of a reply; otherwise skip the SMS. This permission does not apply to other chats or tasks.

**Default: do not send SMS.** The user must explicitly request SMS notifications for the task in the current chat/session. Installation, discovery, mentioning the MCP, earlier tool calls, another user's request, and permission in other sessions do not count as consent. Withdrawn consent stops notifications. This matters on shared accounts: never assume every chat belongs to the phone-number owner.

This is a tool the agent must call. It does not independently monitor the agent, detect crashes, or run after a forcibly terminated session. The one-minute inactivity policy is an agent instruction, not a server-side timer: the MCP server cannot read chat activity or wake an agent after its turn ends. A host without those timing and activity capabilities should skip the notification.

Consent and inactivity rules are instructions to the agent, not per-user authorization enforced by the server. All callers using the shared bearer token can invoke the tool. For enforced isolation, configure this MCP only in the phone-number owner's separate local profile; a shared credential cannot identify which person is using it.

## Connect local Codex

Add the following to your user-level Codex configuration (`~/.codex/config.toml`), substituting your private MCP token:

```toml
[mcp_servers.lemme_know]
url = "https://lemme-know.devreddy7.in/mcp"
http_headers = { Authorization = "Bearer YOUR_MCP_AUTH_TOKEN" }
```

Keep that configuration private. Restart Codex or start a new session to load the server. This local MCP configuration uses bearer authentication directly; the hosted plugin form's OAuth/no-auth options are a separate connection path.

## Tool

`notify_agent_done` takes one required `message` argument written by the LLM:

```json
{ "message": "Deployment finished. All tests passed. Ready for your review." }
```

Messages must contain 1-122 characters after trimming. Only English letters, digits, spaces and simple single-septet GSM-7 punctuation are allowed. Emoji, smart quotes, brackets, backticks, newlines and non-English scripts are rejected before Twilio is called. The account's trial prefix is 38 characters, so 122 characters of LLM text plus that prefix fits exactly within the 160-character single-segment limit. Invalid messages return a tool error so the LLM can shorten or rephrase them.

The recipient and sender cannot be selected by the caller. Successful results include a Twilio message SID and status. A `queued` or `sent` status is not proof of delivery. Check Twilio Messaging logs for final delivery status.

Twilio bills SMS per segment, not per tool call. Current published outbound pricing for India is $0.0832 per segment (checked November 3, 2026); recent messages on this account were billed at that rate. Long messages and Unicode can increase segment counts. Phone-number rental and other usage can also consume credit. Check your actual Twilio balance and message logs rather than assuming the published rate is your whole bill.

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
- [Twilio India SMS pricing](https://www.twilio.com/en-us/sms/pricing/in)
- [SMS character limits and segments](https://www.twilio.com/docs/glossary/what-sms-character-limit)
