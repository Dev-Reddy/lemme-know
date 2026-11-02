export default function handler(_req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ name: 'lemme-know', version: '1.0.0', endpoint: '/mcp', authentication: 'Bearer token', tools: ['notify_agent_done'] });
}
