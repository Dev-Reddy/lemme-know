import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const url = new URL(process.argv[2] || 'http://127.0.0.1:3000/mcp');
const client = new Client({ name: 'lemme-know-smoke', version: '1.0.0' });
try {
  await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${process.env.MCP_AUTH_TOKEN}` } } }));
  console.log(JSON.stringify(await client.listTools(), null, 2));
  // Explicit opt-in: normal smoke tests do not send SMS.
  if (process.argv.includes('--send')) console.log(JSON.stringify(await client.callTool({ name: 'notify_agent_done', arguments: { message: 'Lemme Know updated: agents can now write short SMS notifications. Ready for you.' } }), null, 2));
} finally { await client.close(); }
