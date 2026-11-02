import { createServer } from 'node:http';
import handler from '../api/mcp.js';
const port = Number(process.env.PORT || 3000);
createServer((req, res) => {
  if (req.url?.split('?')[0] === '/mcp') return handler(req, res);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ name: 'lemme-know', endpoint: '/mcp' }));
}).listen(port, '127.0.0.1', () => console.log(`MCP available at http://127.0.0.1:${port}/mcp`));
