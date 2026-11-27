// Writes the email files that live outside the server code, from the one shared design in
// api/_email_templates.js, so every TradeMetric email looks the same.   node scripts/build-emails.mjs
//   supabase/email/confirm-signup.html, reset-password.html   paste into Supabase (Authentication -> Emails)
//   supabase/email/billing/*.html                             the billing emails, ready for the payments work
// Pass a folder to also write a preview of every email there:  node scripts/build-emails.mjs /tmp/previews
import { mkdirSync, writeFileSync } from 'node:fs';
import { render, SAMPLE, TEMPLATES } from '../api/_email_templates.js';

const root = new URL('../supabase/email/', import.meta.url);
mkdirSync(new URL('billing/', root), { recursive: true });

const AUTH = { auth_confirm: ['confirm-signup.html', 'Confirm signup'], auth_reset: ['reset-password.html', 'Reset password'] };
for (const [t, [file, where]] of Object.entries(AUTH)) {
  const m = render(t, {}, {});
  writeFileSync(new URL(file, root), `<!-- TradeMetric: paste into Supabase -> Authentication -> Emails -> "${where}". Subject: ${m.subject} -->\n${m.html}\n`);
}
const BILLING = ['trial_ending', 'receipt', 'payment_failed', 'renewal', 'cancelled'];
for (const t of BILLING) {
  const m = render(t, SAMPLE[t], {});
  writeFileSync(new URL(`billing/${t.replace('_', '-')}.html`, root), `<!-- TradeMetric billing email "${t}" with sample details. NOT sent by anything yet: the wording and the fields it needs are in api/_email_templates.js. Subject: ${m.subject} -->\n${m.html}\n`);
}
const out = process.argv[2];
if (out) {
  mkdirSync(out, { recursive: true });
  for (const t of TEMPLATES) {
    const m = render(t, SAMPLE[t], { unsubUrl: 'https://www.trademetric.app/api/email/unsub?t=sample' });
    writeFileSync(`${out}/${t}.html`, m.html); writeFileSync(`${out}/${t}.txt`, `Subject: ${m.subject}\n\n${m.text}\n`);
  }
}
console.log('email files written');
