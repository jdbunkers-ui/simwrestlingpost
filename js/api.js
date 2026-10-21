/* The Post's only backend is its publication schema. No private-table requests. */
(function () {
  'use strict';
  const config = window.POST_CONFIG || {};
  const base = String(config.supabaseUrl || '').replace(/\/+$/, '');
  const key = String(config.supabasePublishableKey || '');
  const schema = 'public_simwrestlingpost';
  const cache = new Map();
  const pending = new Map();
  function isConfigured() {
    if (!/^https:\/\//.test(base) || /YOUR-PROJECT/i.test(base) || key.length < 20 || /YOUR-SUPABASE|^sb_secret_/i.test(key)) return false;
    if (key.startsWith('eyJ')) {
      try {
        const payload = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        if (JSON.parse(atob(payload)).role !== 'anon') return false;
      } catch (_) { return false; }
    } else if (!key.startsWith('sb_publishable_')) return false;
    return true;
  }
  async function request(path, options = {}) {
    if (!isConfigured()) throw new Error('Publication configuration is incomplete.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(`${base}/rest/v1/${path}`, {
        ...options, signal: controller.signal,
        headers: { apikey: key, 'Accept-Profile': schema,
          ...(options.method === 'POST' ? { 'Content-Profile': schema, 'Content-Type': 'application/json' } : {}),
          ...(options.headers || {}) },
        cache: 'no-store'
      });
      const text = await response.text();
      let data;
      try { data = text ? JSON.parse(text) : null; } catch (_) { throw new Error('Unexpected publication response.'); }
      if (!response.ok) {
        const error = new Error(data?.message || 'Publication request failed.');
        error.code = data?.code; error.status = response.status; throw error;
      }
      return data;
    } finally { clearTimeout(timer); }
  }
  async function read(view, params = {}, force = false) {
    const query = new URLSearchParams({ select: '*', ...params });
    const path = `${view}?${query}`;
    if (!force && cache.has(path) && Date.now() - cache.get(path).time < 55000) return cache.get(path).data;
    if (pending.has(path)) return pending.get(path);
    const promise = request(path).then(data => {
      if (!Array.isArray(data)) throw new Error('Expected publication rows.');
      cache.set(path, { time: Date.now(), data }); return data;
    }).finally(() => pending.delete(path));
    pending.set(path, promise); return promise;
  }
  window.PostApi = Object.freeze({
    isConfigured, read,
    context: (force = false) => read('v_context', { limit: 2 }, force).then(rows => {
      if (rows.length !== 1) throw new Error('A single current league context is required.'); return rows[0];
    }),
    writers: (force = false) => read('v_writers', { order: 'display_order.asc', limit: 100 }, force),
    comment: (articleId, body, displayName) => request('rpc/submit_editorial_comment', {
      method: 'POST', body: JSON.stringify({ p_editorial_guid: articleId, p_comment_body: body, p_display_name: displayName || null })
    })
  });
})();
