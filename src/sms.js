import { z } from 'zod';

// Leave room for Twilio's trial-account prefix. Every allowed character uses
// one GSM-7 septet; emoji, smart punctuation and extension-table symbols do not.
export const messageSchema = z.string().trim().min(1).max(120)
  .regex(/^[A-Za-z0-9 .,!?'"():;@#$%&*+=/_-]+$/, 'Use plain English letters, digits and simple punctuation. No emoji, Unicode or brackets.')
  .describe('Write a short, specific notification explaining what finished or what input is needed. Maximum 120 characters. Plain English only; no emoji, smart quotes, brackets or newlines.');

export async function sendNotification(message, env = process.env, fetchImpl = fetch) {
  const body = messageSchema.parse(message);
  const keys = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER', 'TWILIO_TO_NUMBER'];
  if (keys.some(key => !env[key])) throw new Error('SMS service is not configured.');
  if (!/^AC[a-f0-9]{32}$/i.test(env.TWILIO_ACCOUNT_SID) ||
      ![env.TWILIO_FROM_NUMBER, env.TWILIO_TO_NUMBER].every(n => /^\+[1-9]\d{7,14}$/.test(n))) {
    throw new Error('SMS service configuration is invalid.');
  }
  // Never retry automatically: a timeout can happen after Twilio accepted the SMS.
  let response;
  try {
    response = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: env.TWILIO_TO_NUMBER, From: env.TWILIO_FROM_NUMBER, Body: body }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error('Twilio request interrupted; delivery is unknown. Check Twilio logs before retrying.');
  }
  let data;
  try { data = await response.json(); } catch {
    throw new Error('Twilio returned an unreadable response; check Twilio logs before retrying.');
  }
  if (!response.ok) {
    const code = Number.isInteger(data.code) ? ` (code ${data.code})` : '';
    // Do not return Twilio's raw response: it may contain phone numbers or credentials.
    throw new Error(`Twilio rejected the SMS${code}. Check the Twilio console.`);
  }
  if (!data.sid || !data.status) throw new Error('Twilio response incomplete; check logs before retrying.');
  return { messageSid: data.sid, status: data.status };
}
