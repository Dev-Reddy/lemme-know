import { createHash, timingSafeEqual } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { messageSchema, sendNotification } from './sms.js';

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
      description: 'Send the owner an SMS you write explaining what finished or why you need attention. Call once at the end of the task, or before pausing for user input, when the user requested notifications. Keep it under 120 plain English characters to minimize SMS charges. Cannot detect a crash or stop automatically. Do not retry an uncertain result without checking Twilio logs.',
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
