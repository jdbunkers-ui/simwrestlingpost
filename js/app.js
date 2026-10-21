(function () {
  'use strict';
  const api = window.PostApi;
  const main = document.getElementById('main-content');
  const sidebar = document.getElementById('sidebar');
  const refreshStatus = document.getElementById('refresh-status');
  let context, writers = [], latest = [], renderSequence = 0, busy = false;
  const listLimit = 25;
  const commentState = new Map();
  const commentRequests = new WeakMap();
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value));
  const number = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 }) : '—';
  const date = value => {
    if (!value) return 'Date pending';
    const d = /^\d{4}-\d\d-\d\d$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
    return Number.isNaN(d.valueOf()) ? 'Date pending' : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  };
  const timestamp = value => {
    const d = new Date(value); return Number.isNaN(d.valueOf()) ? '' : d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  };
  const safeAsset = value => /^assets\/writers\/[a-z0-9-]+\.(jpg|jpeg|png|webp)$/.test(value || '') ? value : 'assets/writers/frank-mercer.jpg';
  const portrait = writer => `<img class="post-portrait" src="${escape(safeAsset(writer.portrait_asset_path))}" alt="${escape(writer.writer_name)}" width="148" height="148" loading="lazy">`;
  const mainOrigin = (() => { try { const u = new URL(window.POST_CONFIG.mainSiteUrl); return u.protocol === 'https:' ? u.origin : 'https://simwrestling.com'; } catch (_) { return 'https://simwrestling.com'; } })();
  const profile = (kind, id, label) => uuid(id) ? `<a href="${mainOrigin}/${kind}.html?${kind}=${encodeURIComponent(id)}">${escape(label)}</a>` : escape(label);
  const heading = (kicker, title, deck = '') => `<div class="post-kicker">${escape(kicker)}</div><h2>${escape(title)}</h2>${deck ? `<p class="post-deck">${escape(deck)}</p>` : ''}`;
  const empty = text => `<p class="post-empty">${escape(text)}</p>`;
  const routeLink = (page, params = {}) => `#${page}${Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : ''}`;
  function route() {
    const [part, query = ''] = location.hash.slice(1).split('?');
    const page = ['rankings', 'results', 'schedule', 'recruiting', 'opinion'].includes(part) ? part : 'rankings';
    return { page, query: new URLSearchParams(query) };
  }
  function navigate(page, params = {}) { location.hash = routeLink(page, params); }
  function tabs(items, selected, page, param, extra = {}) {
    return `<div class="post-tabs">${items.map(([value, label]) => `<a href="${routeLink(page, { ...extra, [param]: value })}" ${value === selected ? 'aria-current="page"' : ''}>${escape(label)}</a>`).join('')}</div>`;
  }
  function paging(page, query, offset, hasNext) {
    const params = Object.fromEntries(query); delete params.offset;
    return `<div class="post-paging"><span>Page ${Math.floor(offset / listLimit) + 1}</span><div>${offset ? `<a href="${routeLink(page, { ...params, offset: Math.max(0, offset - listLimit) })}">← Previous</a>` : ''}${hasNext ? `<a href="${routeLink(page, { ...params, offset: offset + listLimit })}">Next →</a>` : ''}</div></div>`;
  }
  function sidebarMarkup() {
    return `<div class="post-aside-block"><div class="post-kicker">The Post's voices</div>${writers.map(w => `<a class="post-mini-writer" href="${routeLink('opinion', { writer: w.writer_slug })}">${portrait(w)}<span><strong>${escape(w.writer_name)}</strong><span class="post-small">${escape(w.column_name)}</span></span></a>`).join('') || empty('The newsroom is preparing its columnist profiles.')}</div><div class="post-aside-block"><div class="post-kicker">From the opinion desk</div>${latest.length ? latest.slice(0, 3).map(a => `<div class="post-rail-story"><span class="post-small">${escape(a.writer_name)}</span><h3><a href="${routeLink('opinion', { writer: a.writer_slug, article: a.editorial_guid })}">${escape(a.headline)}</a></h3></div>`).join('') : '<h3>The conversation starts here.</h3><p class="post-small">Our columnists are preparing their first published articles.</p>'}</div><div class="post-kicker">Recruiting</div><h3>The next generation.</h3><p class="post-small">National recruiting class rankings</p><a class="post-text-button" href="#recruiting">Coming Soon →</a>`;
  }
  async function rankings(query, force) {
    let kind = query.get('view') || 'teams'; if (!['teams', 'p4p', 'weight'].includes(kind)) kind = 'teams';
    let weight = query.get('weight') || '125', options = [];
    if (kind === 'weight') {
      const inventory = await api.read('v_national_weight_class_rankings', { select: 'weight_class_code,weight_class_display_order', order: 'weight_class_display_order.asc', limit: 1000 }, force);
      options = [...new Map(inventory.map(r => [r.weight_class_code, r])).values()];
      if (options.length && !options.some(r => r.weight_class_code === weight)) weight = options[0].weight_class_code;
    }
    const view = kind === 'teams' ? 'v_national_team_rankings' : kind === 'p4p' ? 'v_national_pound_for_pound_rankings' : 'v_national_weight_class_rankings';
    const rows = await api.read(view, { order: 'national_rank.asc', limit: 25, ...(kind === 'weight' ? { weight_class_code: `eq.${weight}` } : {}) }, force);
    return heading('The national rankings', 'The pecking order.', 'The Post’s Top 25 college teams and wrestlers. National coverage. Every weight class.') +
      tabs([['teams', 'Teams'], ['p4p', 'Pound-for-Pound'], ['weight', 'By Weight']], kind, 'rankings', 'view') +
      (kind === 'weight' ? `<label class="post-weight-label">Weight class<select id="weight-select" aria-label="Weight class">${options.map(r => `<option value="${escape(r.weight_class_code)}" ${r.weight_class_code === weight ? 'selected' : ''}>${escape(r.weight_class_code)}</option>`).join('')}</select></label>` : '') +
      (rows.length ? `<table aria-label="National ${escape(kind === 'teams' ? 'team' : 'wrestler')} rankings"><thead><tr><th>Rank</th><th>${kind === 'teams' ? 'College team' : 'Wrestler'}</th><th class="post-number">Record</th><th class="post-number post-extra-col">${kind === 'teams' ? 'Avg. margin' : 'Bonus %'}</th></tr></thead><tbody>${rows.map(r => `<tr><td>${number(r.national_rank)}</td><td><span class="post-team">${kind === 'teams' ? profile('team', r.team_guid, r.team_name) : profile('wrestler', r.wrestler_guid, r.wrestler_name)}</span><span class="post-table-sub">${kind === 'teams' ? escape(r.state_code) : profile('team', r.team_guid, r.team_name) + ' · ' + escape(r.weight_class_code) + ' lb · ' + escape(r.academic_stage_display)}</span></td><td class="post-number">${escape(kind === 'teams' ? r.dual_record_display : r.record_display)}</td><td class="post-number post-extra-col">${number(kind === 'teams' ? r.average_dual_margin : r.bonus_point_percentage)}${kind === 'teams' ? '' : '%'}</td></tr>`).join('')}</tbody></table><p class="post-small">${rows.length} ranked ${kind === 'teams' ? 'teams' : 'wrestlers'} · ${escape(date(context.current_league_date))}</p>` : empty('Rankings are not yet available for this selection.'));
  }
  async function results(query, force) {
    let kind = query.get('type') || 'dual'; if (!['dual', 'team-tournament', 'individual', 'individual-team'].includes(kind)) kind = 'dual';
    const offset = Math.max(0, Math.min(100000, parseInt(query.get('offset'), 10) || 0));
    let rows;
    if (kind === 'individual-team') rows = await api.read('v_individual_tournament_team_results', { order: 'scheduled_date.desc,event_name.asc,team_placement.asc,team_guid.asc', limit: listLimit + 1, offset }, force);
    else if (kind === 'individual') rows = await api.read('v_individual_tournament_results', { order: 'ends_on.desc,event_name.asc,weight_class_code.asc,final_placement.asc,wrestler_guid.asc', limit: listLimit + 1, offset }, force);
    else rows = await api.read('v_dual_results', { result_category: `eq.${kind === 'dual' ? 'DUAL_TEAM_MATCH' : 'DUAL_TEAM_TOURNAMENT'}`, order: 'scheduled_date.desc,dual_order.asc,scheduled_dual_guid.asc', limit: listLimit + 1, offset }, force);
    const next = rows.length > listLimit; rows = rows.slice(0, listLimit);
    let html = heading('From the scorebook', 'The scores. No spin.', 'College dual meets, dual team tournaments, and individual tournament placements.') + tabs([['dual', 'Dual Meets'], ['team-tournament', 'Team Tournaments'], ['individual', 'Individual Tournaments']], kind.startsWith('individual') ? 'individual' : kind, 'results', 'type');
    if (kind.startsWith('individual')) html += tabs([['individual','Wrestler Placements'],['individual-team','Team Standings']],kind,'results','type');
    if (!rows.length) return html + empty('No completed results are available for this selection.');
    if (kind === 'individual-team') html += `<table aria-label="Individual tournament team standings"><thead><tr><th>Place</th><th>College & event</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${number(r.team_placement)}</td><td><span class="post-team">${profile('team',r.team_guid,r.team_name)}</span><span class="post-table-sub">${profile('event',r.scheduled_event_guid,r.event_name)} · ${escape(date(r.scheduled_date))}</span></td></tr>`).join('')}</tbody></table>`;
    else if (kind === 'individual') html += `<table aria-label="Individual tournament placements"><thead><tr><th>Place</th><th>Wrestler & event</th><th class="post-number">Weight</th></tr></thead><tbody>${rows.map(r => `<tr><td>${number(r.final_placement)}</td><td><span class="post-team">${profile('wrestler', r.wrestler_guid, r.wrestler_name)}</span><span class="post-table-sub">${profile('team', r.team_guid, r.team_name)}</span><span class="post-table-sub">${profile('tournament', r.tournament_guid, r.event_name)} · ${escape(date(r.ends_on))}</span></td><td class="post-number">${escape(r.weight_class_code)}</td></tr>`).join('')}</tbody></table>`;
    else html += rows.map(r => `<div class="post-result"><div class="post-small">${escape(r.event_name)}${r.round_code ? ' · ' + escape(r.round_code.replace(/_/g, ' ')) : ''}</div><div class="post-scoreline"><span>${profile('team', r.team_1_guid, r.team_1_name)}</span><b>${number(r.team_1_score)}</b></div><div class="post-scoreline"><span>${profile('team', r.team_2_guid, r.team_2_name)}</span><b>${number(r.team_2_score)}</b></div><div class="post-result-footer"><span class="post-small">Final · ${escape(date(r.scheduled_date))}${r.tie_ind ? ' · Tie' : ''}</span><span>${profile('dual', r.dual_guid, 'Read the dual →')}</span></div></div>`).join('');
    return html + `<div class="post-small">Showing ${offset + 1}–${offset + rows.length}</div>` + paging('results', query, offset, next);
  }
  async function schedule(query, force) {
    const week = query.get('week') || 'all';
    const params = { order: 'scheduled_date.asc,event_name.asc', limit: 500 };
    if (/^[1-8]$/.test(week)) params.week_number = `eq.${week}`;
    const rows = await api.read('v_schedule', params, force);
    return heading('The college calendar', 'Circle these dates.', 'The season’s dual meets and tournament sessions, from the opening whistle to the championship mat.') +
      `<label class="post-weight-label">Season week<select id="week-select"><option value="all">All weeks</option>${Array.from({ length: 8 }, (_, i) => `<option value="${i + 1}" ${week === String(i + 1) ? 'selected' : ''}>Week ${i + 1}</option>`).join('')}</select></label>` +
      (rows.length ? rows.map(r => `<div class="post-result"><div class="post-kicker">${escape(date(r.scheduled_date))}</div><div class="post-small">Week ${number(r.week_number)}${r.tournament_type_label ? ' · ' + escape(r.tournament_type_label) : ''}</div><h3>${uuid(r.scheduled_event_guid) ? profile('event', r.scheduled_event_guid, r.event_name) : escape(r.event_name)}</h3>${r.session_label ? `<p>${escape(r.session_label)}</p>` : ''}<div class="post-small">${escape(String(r.event_status || 'SCHEDULED').replace(/_/g, ' '))}${r.raw_event_qty > 1 ? ' · ' + number(r.raw_event_qty) + ' events' : ''}</div></div>`).join('') : empty('No events are scheduled for this selection.'));
  }
  async function recruiting(force) {
    const rows = await api.read('v_recruiting_status', { limit: 1 }, force);
    return heading('National recruiting class rankings', 'The next generation.') + `<div class="post-coming"><div class="post-small">THE NEXT CHAPTER</div><h2>${escape(rows[0]?.display_message || 'Coming Soon')}</h2><p>Tomorrow’s contenders begin with today’s commitments.</p></div>`;
  }
  async function opinion(query, force) {
    const writer = writers.find(w => w.writer_slug === query.get('writer')) || writers[0];
    if (!writer) return heading('Opinion', 'From the newsroom.') + empty('The Post is preparing its columnist profiles.');
    const offset = Math.max(0, Math.min(100000, parseInt(query.get('offset'), 10) || 0));
    const items = await api.read('v_editorial_index', { writer_slug: `eq.${writer.writer_slug}`, order: 'league_publication_date.desc,first_published_at.desc,editorial_guid.desc', limit: listLimit + 1, offset }, force);
    const hasNext = items.length > listLimit; let articles = items.slice(0, listLimit);
    const requested = query.get('article');
    if (uuid(requested) && !articles.some(a => a.editorial_guid === requested)) {
      const found = await api.read('v_editorial_index', { editorial_guid: `eq.${requested}`, limit: 1 }, force);
      if (found[0] && found[0].writer_slug === writer.writer_slug) articles = [found[0], ...articles];
    }
    return `<div class="post-kicker">Opinion · The Post’s columnists</div>` + tabs(writers.map(w => [w.writer_slug, w.writer_name]), writer.writer_slug, 'opinion', 'writer') +
      `<div class="post-profile">${portrait(writer)}<div class="post-profile-copy"><div class="post-kicker">${escape(writer.column_name)}</div><h2>${escape(writer.writer_name)}</h2><div class="post-small">${escape(writer.role_title)}</div><p>${escape(writer.biography)}</p><div class="post-credentials">${escape(writer.wrestling_accomplishments)}<br>${escape(writer.regional_experience)}</div></div></div><div class="post-article-list"><div class="post-small">PUBLISHED COLUMNS · NEWEST FIRST</div>${articles.length ? articles.map(a => `<details class="article-detail" data-article="${escape(a.editorial_guid)}" ${requested === a.editorial_guid ? 'open' : ''}><summary><span class="post-small">${escape(date(a.league_publication_date))} · ${escape(a.column_name)}</span>${escape(a.headline)}</summary>${a.summary ? `<p class="post-deck">${escape(a.summary)}</p>` : ''}<div class="article-body-slot" role="status">Open to read the column.</div><div class="article-comment-slot"></div></details>`).join('') : empty('No columns have been published by this writer yet. Check back for the first edition.')}</div>${offset || hasNext ? paging('opinion', new URLSearchParams({ writer: writer.writer_slug }), offset, hasNext) : ''}`;
  }
  // Safe, deliberately limited Markdown: escaped text, paragraphs, headings,
  // emphasis, quotes, and bullet lists. Raw HTML/images/embedded content disabled.
  function markdown(text) {
    const inline = value => escape(value).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/`([^`]+)`/g, '<code>$1</code>');
    return String(text || '').replace(/\r\n/g, '\n').split(/\n\s*\n/).map(block => {
      const lines = block.trim().split('\n'); if (!block.trim()) return '';
      if (lines.every(l => /^[-*] /.test(l))) return '<ul>' + lines.map(l => `<li>${inline(l.slice(2))}</li>`).join('') + '</ul>';
      if (lines.length === 1 && /^#{1,3} /.test(lines[0])) return `<h3>${inline(lines[0].replace(/^#{1,3} /, ''))}</h3>`;
      if (lines.every(l => /^> ?/.test(l))) return `<blockquote>${lines.map(l => inline(l.replace(/^> ?/, ''))).join('<br>')}</blockquote>`;
      return `<p>${lines.map(inline).join('<br>')}</p>`;
    }).join('');
  }
  async function loadArticle(detail, force = false) {
    if (!detail.open || detail.dataset.loading === 'true') return;
    if (detail.dataset.loaded === 'true' && !force) return;
    const id = detail.dataset.article; detail.dataset.loading = 'true';
    try {
      const rows = await api.read('v_editorials', { editorial_guid: `eq.${id}`, limit: 1 }, force);
      if (!detail.isConnected) return;
      if (!rows.length) { detail.querySelector('.article-body-slot').innerHTML = empty('This article is no longer available.'); detail.querySelector('.article-comment-slot').replaceChildren(); return; }
      const article = rows[0];
      detail.querySelector('.article-body-slot').innerHTML = `<div class="post-article-body">${markdown(article.body_markdown)}<button type="button" class="post-text-button" data-collapse>Collapse article ↑</button></div>`;
      detail.dataset.loaded = 'true';
      if (!detail.querySelector('.post-comment-section')) {
        detail.querySelector('.article-comment-slot').innerHTML = `<section class="post-comment-section" data-comment-article="${id}"><h3>Join the conversation.</h3><p class="post-small">No account required · Latest comments first</p><div class="comment-list" aria-live="polite"></div><button type="button" class="post-text-button" data-more-comments hidden>Earlier comments ↓</button><form class="comment-form"><label>Display name <span class="post-small">(optional)</span><input name="displayName" maxlength="60" autocomplete="nickname" placeholder="Anonymous"></label><label>Your comment<textarea name="commentBody" required maxlength="4000" placeholder="Add your perspective…"></textarea></label><button class="post-primary" type="submit">Post comment</button><p class="post-small comment-feedback" role="status" aria-live="polite">Comments appear immediately. Keep the conversation about wrestling.</p></form></section>`;
      }
      await loadComments(detail.querySelector('.post-comment-section'), force);
    } catch (error) {
      console.error('Article request failed:', error.message);
      if (detail.isConnected && detail.dataset.loaded !== 'true') detail.querySelector('.article-body-slot').innerHTML = `<p>We couldn’t load this column.</p><button type="button" class="post-text-button" data-retry-article>Try again →</button>`;
    } finally { detail.dataset.loading = 'false'; }
  }
  async function loadComments(section, force = false, more = false) {
    if (!section) return;
    const previous = commentRequests.get(section);
    if (previous) {
      await previous;
      if (!force && !more) return;
    }
    const task = fetchComments(section, force, more);
    commentRequests.set(section, task);
    try { await task; } finally { if (commentRequests.get(section) === task) commentRequests.delete(section); }
  }
  async function fetchComments(section, force = false, more = false) {
    const id = section.dataset.commentArticle;
    const state = commentState.get(id) || { visible: 30 };
    if (more) state.visible += 30;
    section.dataset.loading = 'true';
    try {
      const rows = await api.read('v_editorial_comments', { editorial_guid: `eq.${id}`, order: 'created_at.desc,comment_guid.desc', limit: state.visible + 1 }, force);
      if (!section.isConnected) return;
      section.querySelector('.comment-list').innerHTML = rows.length ? rows.slice(0, state.visible).map(c => `<div class="post-comment"><div class="post-comment-byline"><strong>${escape(c.display_name)}</strong><time class="post-small" datetime="${escape(c.created_at)}">${escape(timestamp(c.created_at))}</time></div><p>${escape(c.comment_body).replace(/\n/g, '<br>')}</p></div>`).join('') : empty('Be the first to share your perspective.');
      section.querySelector('[data-more-comments]').hidden = rows.length <= state.visible;
      commentState.set(id, state);
    } catch (error) {
      console.error('Comment request failed:', error.message);
      if (!section.querySelector('.comment-list').textContent) section.querySelector('.comment-list').innerHTML = empty('Comments are temporarily unavailable.');
    } finally { section.dataset.loading = 'false'; }
  }
  async function render(force = false, silent = false) {
    if (!api.isConfigured()) {
      main.innerHTML = heading('The national edition', 'The Post is being prepared.', 'Our college wrestling coverage will appear here shortly.'); sidebar.replaceChildren(); return;
    }
    const sequence = ++renderSequence, current = route(); busy = true;
    document.querySelectorAll('[data-nav]').forEach(a => a.toggleAttribute('aria-current', a.dataset.nav === current.page));
    document.querySelectorAll('[data-nav][aria-current]').forEach(a => a.setAttribute('aria-current', 'page'));
    if (!silent) main.innerHTML = '<p class="post-deck" role="status">Opening this section…</p>';
    try {
      const [clock, authors, articles] = await Promise.all([api.context(force), api.writers(force), api.read('v_editorial_index', { order: 'league_publication_date.desc,first_published_at.desc', limit: 3 }, force)]);
      if (sequence !== renderSequence) return;
      context = clock; writers = authors; latest = articles;
      const html = current.page === 'rankings' ? await rankings(current.query, force) : current.page === 'results' ? await results(current.query, force) : current.page === 'schedule' ? await schedule(current.query, force) : current.page === 'recruiting' ? await recruiting(force) : await opinion(current.query, force);
      if (sequence !== renderSequence) return;
      main.innerHTML = html; sidebar.innerHTML = sidebarMarkup();
      document.getElementById('edition').textContent = `${context.season_code?.replace(/_/g, '–') || 'Current season'} · ${date(context.current_league_date)} · National edition`;
      document.title = `${current.page[0].toUpperCase() + current.page.slice(1)} | The SimWrestling Post`;
      refreshStatus.replaceChildren();
      main.querySelectorAll('details[open]').forEach(d => loadArticle(d, force));
    } catch (error) {
      console.error('Publication request failed:', error.message);
      if (sequence !== renderSequence) return;
      if (!silent) main.innerHTML = heading('From the newsroom', 'Coverage is temporarily unavailable.', 'Please try again in a moment.') + '<button class="post-primary" data-retry type="button">Try again</button>';
      else refreshStatus.textContent = 'We couldn’t refresh this edition. Displayed coverage may be older. We’ll try again shortly.';
    } finally { if (sequence === renderSequence) busy = false; }
  }
  async function refresh() {
    if (document.hidden || busy || document.querySelector('.comment-form [type="submit"]:disabled')) return;
    if (document.activeElement?.matches('input,textarea,select')) return;
    const open = [...main.querySelectorAll('details[open]')];
    if (open.length) { await Promise.all(open.map(d => loadArticle(d, true))); return; }
    await render(true, true);
  }
  main.addEventListener('change', event => {
    if (event.target.id === 'weight-select') navigate('rankings', { view: 'weight', weight: event.target.value });
    if (event.target.id === 'week-select') navigate('schedule', { week: event.target.value });
  });
  main.addEventListener('toggle', event => { if (event.target.matches('.article-detail') && event.target.open) loadArticle(event.target); }, true);
  main.addEventListener('click', event => {
    if (event.target.closest('[data-retry]')) render(true);
    if (event.target.closest('[data-retry-article]')) loadArticle(event.target.closest('details'), true);
    const collapse = event.target.closest('[data-collapse]');
    if (collapse) { const detail = collapse.closest('details'); detail.open = false; detail.querySelector('summary').focus(); }
    if (event.target.closest('[data-more-comments]')) loadComments(event.target.closest('.post-comment-section'), true, true);
  });
  main.addEventListener('submit', async event => {
    const form = event.target.closest('.comment-form'); if (!form) return;
    event.preventDefault(); const section = form.closest('.post-comment-section'), button = form.querySelector('button[type="submit"]'), feedback = form.querySelector('.comment-feedback');
    const body = form.querySelector('[name="commentBody"]').value.trim(), name = form.querySelector('[name="displayName"]').value.trim();
    if (!body) { feedback.textContent = 'Please enter a comment.'; return; }
    if (button.disabled) return; button.disabled = true; feedback.textContent = 'Posting your comment…';
    try {
      await api.comment(section.dataset.commentArticle, body, name);
      form.querySelector('[name="commentBody"]').value = '';
      await loadComments(section, true);
      feedback.textContent = 'Your comment has been posted.';
    } catch (error) {
      console.error('Comment submission failed:', error.message);
      feedback.textContent = 'We couldn’t confirm posting. Check the comments before trying again.';
    } finally { button.disabled = false; }
  });
  document.getElementById('game-link').href = mainOrigin;
  window.addEventListener('hashchange', () => render());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.addEventListener('focus', refresh);
  setInterval(refresh, Math.max(30000, Number(window.POST_CONFIG?.refreshIntervalMs) || 60000));
  render();
})();
