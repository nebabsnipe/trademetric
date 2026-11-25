// TEMPORARY: lets the owner confirm server errors reach Sentry on a preview. Removed right after the test.
import { withSentry } from './_sentry.js';
async function handler(req, res) {
  if (process.env.VERCEL_ENV === 'production') return res.status(404).end();
  throw new Error('TradeMetric test error from /api/sentry-test (safe to ignore)');
}
export default withSentry(handler, 'sentry-test');
