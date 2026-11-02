import { createHash, timingSafeEqual } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { MAX_MESSAGE_LENGTH, messageSchema, sendNotification } from './sms.js';

export function createHandler({ env = process.env, send = message => sendNotification(message, env) } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const respond = (status, error) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error }));
    };
    if (!env.MCP_AUTH_TOKEN || env.MCP_AUTH_TOKEN.length < 32) return respond(503, 'Authentication is not configured.');
    const authorization = req.headers.authorization;
    const expected = `Bearer ${env.MCP_AUTH_TOKEN}`;
    const hash = value => createHash('sha256').update(value).digest();
    if (typeof authorization !== 'string' || !timingSafeEqual(hash(authorization), hash(expected))) {
      res.setHeader('WWW-Authenticate', 'Bearer realm="lemme-know"');
      return respond(401, 'Unauthorized');
    }
    // This connector is server-to-server. Browser origins have no access.
    if (req.headers.origin) return respond(403, 'Browser requests are not supported.');
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return respond(405, 'Use Streamable HTTP POST.');
    }
    const server = new McpServer({ name: 'lemme-know', version: '1.0.0' });
    server.registerTool('notify_agent_done', {
      title: 'Notify me by SMS',
      description: `DEFAULT: DO NOT CALL. This account may be shared. Call only if the user explicitly requested SMS notifications for this task in the current chat/session, for example "text me when this finishes". If there is no such explicit request in this session, never send an SMS. Tool availability, installation, discovery, a mention of the MCP, a previous tool call, permission in another chat, or another account user's request does not establish consent. Never infer consent or carry it across sessions; stop if consent is withdrawn. Even with consent, send a single SMS only after a long-running, substantial task has finished or become blocked, and the user has not replied for at least 60 seconds after that completion or blocker. Do not call immediately, on every chat turn, for short tasks, routine questions, progress updates, or urgent requests without the same waiting period. If the user replies during that minute, do not send. The host or agent must actually be able to observe the wait and lack of a reply; this server cannot monitor chat activity, schedule a later call, or detect crashes. If that cannot be verified, do not call. Write what finished or what is blocking progress, using at most ${MAX_MESSAGE_LENGTH} plain English characters for one SMS segment including the trial prefix. Send at most once per completion or blocker; do not retry uncertain delivery without checking Twilio logs.`,
      inputSchema: { message: messageSchema },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    }, async ({ message }) => {
      try {
        const result = await send(message);
        return { content: [{ type: 'text', text: JSON.stringify({ ...result, note: 'Accepted by Twilio; this is not confirmation of handset delivery.' }) }] };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: error.message }] };
      }
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void transport.close(); void server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) respond(500, 'MCP request failed.');
      else if (!res.writableEnded) res.end();
    }
  };
}
