// Answers /api/report through api/market.js (files starting with "_" are not endpoints of their own).
// Problem reports: each visitor's browser sends a short technical note when something on the site fails to load or
// breaks (see diagSend in js/app.js), so problems on other people's computers can be seen, not guessed at.
// Saved to the client_reports table (supabase/reports.sql), which only the site owner's account can read.
// Holds no league contents, emails or passwords.

import { sharedOn, reportPut } from './_shared.js';
import { withSentry } from './_sentry.js';

const clip = (v, n) => (v == null ? null : String(v).slice(0, n));

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = null; } }
  if (!b || typeof b !== 'object' || JSON.stringify(b).length > 20000) return res.status(400).end();
  const row = {
    sid: clip(b.sid, 16),
    uid: /^[0-9a-f-]{36}$/i.test(b.uid || '') ? b.uid : null,          // sent by the page, so a hint, not proof
    username: clip(b.user, 40),
    snap: b.snap && typeof b.snap === 'object' ? b.snap : {},
    notes: Array.isArray(b.notes) ? b.notes.slice(0, 40).map(x => ({ k: clip(x && x.k, 40), m: clip(x && x.m, 300), t: +(x && x.t) || 0 })) : [],
    country: clip(req.headers['x-vercel-ip-country'], 4),
  };
  if (sharedOn()) await reportPut(row);
  res.status(204).end();
}

export default withSentry(handler, 'report');
