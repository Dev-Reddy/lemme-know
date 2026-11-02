import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createHandler } from '../src/handler.js';
import { messageSchema, sendNotification } from '../src/sms.js';

const token = 'test-token-with-at-least-thirty-two-characters';
async function fixture(t, send, env = { MCP_AUTH_TOKEN: token }) {
  const server = createServer(createHandler({ env, send }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return new URL(`http://127.0.0.1:${server.address().port}/mcp`);
}
test('rejects missing/wrong auth and browser origins before sending', async t => {
  let calls = 0;
  const url = await fixture(t, () => { calls++; });
  for (const authorization of ['', 'Bearer wrong']) {
    const r = await fetch(url, { method: 'POST', headers: { authorization } });
    assert.equal(r.status, 401);
  }
  const r = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, origin: 'https://untrusted.example' } });
  assert.equal(r.status, 403);
  assert.equal(calls, 0);
});
test('fails closed when the authentication token is missing or weak', async t => {
  const url = await fixture(t, () => assert.fail('must not send'), { MCP_AUTH_TOKEN: 'short' });
  assert.equal((await fetch(url, { method: 'POST' })).status, 503);
});
test('real MCP client initializes, lists exactly one tool, and calls it', async t => {
  let calls = 0;
  const message = 'Repository updated. Tests passed. Ready for your review.';
  const url = await fixture(t, async text => { assert.equal(text, message); calls++; return { messageSid: 'SMtest', status: 'queued' }; });
  const client = new Client({ name: 'test', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(tool => tool.name), ['notify_agent_done']);
  assert.equal(calls, 0);
  for (const args of [{}, { message: 'a'.repeat(121) }, { message: 'Finished ✅' }, { message: '   ' }]) {
    const invalid = await client.callTool({ name: 'notify_agent_done', arguments: args });
    assert.equal(invalid.isError, true);
    assert.equal(calls, 0);
  }
  const result = await client.callTool({ name: 'notify_agent_done', arguments: { message } });
  assert.ok(!result.isError);
  assert.equal(JSON.parse(result.content[0].text).status, 'queued');
  assert.equal(calls, 1);
});
test('Twilio requests use the fixed destination, LLM-written body and server credentials', async () => {
  const env = { TWILIO_ACCOUNT_SID: `AC${'a'.repeat(32)}`, TWILIO_AUTH_TOKEN: 'secret', TWILIO_TO_NUMBER: '+15555550100', TWILIO_FROM_NUMBER: '+15555550101' };
  const message = 'Tests passed. Your app is ready for review.';
  const result = await sendNotification(message, env, async (url, options) => {
    assert.equal(new URL(url).hostname, 'api.twilio.com');
    assert.equal(options.body.get('To'), env.TWILIO_TO_NUMBER);
    assert.equal(options.body.get('From'), env.TWILIO_FROM_NUMBER);
    assert.equal(options.body.get('Body'), message);
    assert.equal(options.headers.Authorization, `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:secret`).toString('base64')}`);
    return Response.json({ sid: 'SMtest', status: 'queued' }, { status: 201 });
  });
  assert.equal(result.status, 'queued');
});
test('Twilio errors are sanitized and uncertain sends are never retried', async () => {
  const env = { TWILIO_ACCOUNT_SID: `AC${'a'.repeat(32)}`, TWILIO_AUTH_TOKEN: 'secret', TWILIO_TO_NUMBER: '+15555550100', TWILIO_FROM_NUMBER: '+15555550101' };
  await assert.rejects(sendNotification('Done.', env, async () => Response.json({ code: 20003, message: 'sensitive phone and secret' }, { status: 401 })), { message: 'Twilio rejected the SMS (code 20003). Check the Twilio console.' });
  let calls = 0;
  await assert.rejects(sendNotification('Done.', env, async () => { calls++; throw new Error('sensitive'); }), /delivery is unknown/);
  assert.equal(calls, 1);
});
test('message budget accepts 120 single-septet characters and rejects costly encodings', () => {
  assert.equal(messageSchema.parse('a'.repeat(120)).length, 120);
  assert.equal(messageSchema.parse('  Ready for you.  '), 'Ready for you.');
  for (const text of ['a'.repeat(121), 'Done ✅', '“Done”', 'नमस्ते', 'path[0]', 'a\nb', '`code`']) {
    assert.equal(messageSchema.safeParse(text).success, false);
  }
});
