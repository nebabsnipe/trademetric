// Server function for the AI Helper, scouting reports and screenshot reading.
// Runs on Vercel. Your Anthropic API key lives in the ANTHROPIC_API_KEY
// (or APIKEY1) environment variable, never in the browser.

const API_KEY = process.env.ANTHROPIC_API_KEY || process.env.APIKEY1;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const MAX_PROMPT = 60000;          // characters
const MAX_IMAGES = 2;
const PER_IP_PER_HOUR = 40;        // simple abuse guard (per server instance)

const hits = new Map();
function limited(ip) {
  const now = Date.now(), hour = 3600e3;
  const list = (hits.get(ip) || []).filter(t => now - t < hour);
  list.push(now); hits.set(ip, list);
  return list.length > PER_IP_PER_HOUR;
}

function parseJSON(text) {
  try { return JSON.parse(text); } catch {}
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) { try { return JSON.parse(m[1]); } catch {} }
  const a = text.search(/[\[{]/), b = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch {} }
  return undefined;
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ ok: !!API_KEY });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!API_KEY) return res.status(503).json({ code: 'not_configured', error: 'AI is not set up yet.' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0] || 'unknown';
  if (limited(ip)) return res.status(429).json({ code: 'rate_limited', error: 'Too many AI requests. Try again later.' });

  const { prompt, images = [] } = req.body || {};
  if (typeof prompt !== 'string' || !prompt.trim()) return res.status(400).json({ error: 'Missing prompt' });
  if (prompt.length > MAX_PROMPT) return res.status(413).json({ error: 'Prompt too long' });

  const content = [];
  for (const img of images.slice(0, MAX_IMAGES)) {
    if (img && typeof img.data === 'string' && /^image\/(png|jpeg|gif|webp)$/.test(img.media_type)) {
      content.push({ type: 'image', source: { type: 'base64', media_type: img.media_type, data: img.data } });
    }
  }
  content.push({ type: 'text', text: prompt });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2500,
        system: 'You are the analysis engine for TradeMetric, a fantasy football site. Reply with valid JSON only, no prose around it.',
        messages: [{ role: 'user', content }],
      }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ code: 'upstream', error: j?.error?.message || 'AI service error' });
    const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    const data = parseJSON(text);
    if (data === undefined) return res.status(502).json({ code: 'invalid_json', error: 'AI reply was not JSON', text });
    return res.status(200).json({ data });
  } catch (e) {
    return res.status(500).json({ code: 'error', error: 'AI request failed' });
  }
}

export const config = { maxDuration: 60 };
