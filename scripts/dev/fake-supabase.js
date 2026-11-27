/* A stand-in for the Supabase library, used only by scripts/dev/shots.mjs.
   window.__TM_FAKE = { signedIn: true|false, user: {id, name} } decides who is "signed in".
   The saved account row lives in localStorage ('fake-user-state') so it survives reloads. */
const cfg = window.__TM_FAKE || { signedIn: false };
const user = cfg.signedIn ? { id: cfg.user.id, email: cfg.user.name + '@example.com', created_at: '2026-08-20T12:00:00Z',
  user_metadata: { username: cfg.user.name }, app_metadata: { provider: 'email', providers: ['email'] }, identities: [{ provider: 'email', id: '1' }] } : null;
const session = user ? { access_token: 'fake-token', refresh_token: 'fake', expires_at: 4102444800, user } : null;
const LS = 'fake-user-state';
const row = () => { try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { return null; } };

function table(name) {
  const q = { op: 'select', single: false, body: null };
  const run = async () => {
    let data = null;
    if (name === 'user_state') {
      if (q.op === 'upsert' || q.op === 'update') { const b = q.body; const cur = row() || {}; const next = { ...cur, ...b, user_id: user && user.id };
        localStorage.setItem(LS, JSON.stringify(next)); data = [{ updated_at: next.updated_at }]; }
      else { const r = row(); data = q.single ? r : r ? [r] : []; }
    } else if (name === 'profiles') {
      const p = user ? { id: user.id, username: cfg.user.name, plan: 'free', created_at: user.created_at } : null;
      data = q.op === 'select' ? (q.single ? p : p ? [p] : []) : [p];
    } else data = q.single ? null : [];
    return { data, error: null };
  };
  const b = new Proxy({}, { get(_, k) {
    if (k === 'then') return (res, rej) => run().then(res, rej);
    if (k === 'maybeSingle' || k === 'single') return () => { q.single = true; return b; };
    if (k === 'upsert' || k === 'update' || k === 'insert' || k === 'delete') return body => { q.op = k; q.body = body; return b; };
    return () => b;
  } });
  return b;
}
const ok = async () => ({ data: {}, error: null });
export function createClient() {
  return {
    auth: new Proxy({
      getSession: async () => ({ data: { session }, error: null }),
      getUser: async () => ({ data: { user }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({ error: null }),
    }, { get: (t, k) => t[k] || ok }),
    from: table,
    rpc: async () => ({ data: true, error: null }),
    channel: () => new Proxy({}, { get: () => () => ({}) }),
  };
}
