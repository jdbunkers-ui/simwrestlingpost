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
  const profile = (kind, id, label) => escape(label);
  const heading = (kicker, title, deck = '') => `${kicker ? `<div class="post-kicker">${escape(kicker)}</div>` : ''}<h2>${escape(title)}</h2>${deck ? `<p class="post-deck">${escape(deck)}</p>` : ''}`;
  const empty = text => `<p class="post-empty">${escape(text)}</p>`;
  const routeLink = (page, params = {}) => `#${page}${Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : ''}`;
  function route() {
    const [part, query = ''] = location.hash.slice(1).split('?');
    const page = ['rankings', 'results', 'recruiting', 'opinion'].includes(part) ? part : 'rankings';
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
    return heading('', 'THE NATIONAL RANKINGS', 'The Post’s Top 25 college teams and wrestlers. National coverage. Every weight class.') +
      tabs([['teams', 'Teams'], ['p4p', 'Pound-for-Pound'], ['weight', 'By Weight']], kind, 'rankings', 'view') +
      (kind === 'weight' ? `<label class="post-weight-label">Weight class<select id="weight-select" aria-label="Weight class">${options.map(r => `<option value="${escape(r.weight_class_code)}" ${r.weight_class_code === weight ? 'selected' : ''}>${escape(r.weight_class_code)}</option>`).join('')}</select></label>` : '') +
      (rows.length ? `<table aria-label="National ${escape(kind === 'teams' ? 'team' : 'wrestler')} rankings"><thead><tr><th>Rank</th><th>${kind === 'teams' ? 'College team' : 'Wrestler'}</th><th class="post-number">Record</th>${kind === 'teams' ? '' : '<th class="post-number post-extra-col">Bonus %</th>'}</tr></thead><tbody>${rows.map(r => `<tr><td>${number(r.national_rank)}</td><td><span class="post-team">${kind === 'teams' ? profile('team', r.team_guid, r.team_name) : profile('wrestler', r.wrestler_guid, r.wrestler_name)}</span><span class="post-table-sub">${kind === 'teams' ? escape(r.state_code) : profile('team', r.team_guid, r.team_name) + ' · ' + escape(r.weight_class_code) + ' lb · ' + escape(r.academic_stage_display)}</span></td><td class="post-number">${escape(kind === 'teams' ? r.dual_record_display : r.record_display)}</td>${kind === 'teams' ? '' : `<td class="post-number post-extra-col">${number(r.bonus_point_percentage)}%</td>`}</tr>`).join('')}</tbody></table><p class="post-small">${rows.length} ranked ${kind === 'teams' ? 'teams' : 'wrestlers'} · ${escape(date(context.current_league_date))}</p>` : empty('Rankings are not yet available for this selection.'));
  }
  async function readAll(view, params, force) {
    const all = [], size = 500;
    for (let offset = 0; ; offset += size) {
      const batch = await api.read(view, { ...params, limit: size, offset }, force);
      all.push(...batch);
      if (batch.length < size) return all;
    }
  }
  async function results(query, force) {
    const requested = query.get('type');
    const individual = ['individual', 'individual-team', 'individual-wrestlers'].includes(requested);
    const wrestlers = requested === 'individual-wrestlers';
    const kind = individual ? (wrestlers ? 'individual-wrestlers' : 'individual-team') : 'teams';
    let html = heading('From the scorebook', 'The scores. No spin.', 'The latest completed college results from the current season.') +
      tabs([['teams', 'Team Scores'], ['individual-team', 'Individual Tournaments']], individual ? 'individual-team' : 'teams', 'results', 'type');
    if (individual) html += tabs([['individual-team', 'Team Standings'], ['individual-wrestlers', 'Wrestler Placements']], kind, 'results', 'type');
    const season = { season_guid: `eq.${context.season_guid}` };
    if (!individual) {
      const newest = await api.read('v_dual_results', { ...season, scheduled_date: `lte.${context.current_league_date}`, order: 'scheduled_date.desc,scheduled_dual_guid.asc', limit: 1 }, force);
      if (!newest.length) return html + empty('No completed college team scores are available this season.');
      const day = newest[0].scheduled_date;
      const rows = await readAll('v_dual_results', { ...season, scheduled_date: `eq.${day}`, order: 'event_name.asc,round_number.asc,dual_order.asc,scheduled_dual_guid.asc' }, force);
      html += `<p class="post-small">${escape(context.season_code?.replace(/_/g, '–'))} · ${escape(date(day))}</p>`;
      return html + rows.map(r => `<div class="post-result"><div class="post-small">${escape(r.event_name)}${r.round_code ? ' · ' + escape(r.round_code.replace(/_/g, ' ')) : ''}</div><div class="post-scoreline"><span>${escape(r.team_1_name)}</span><b>${number(r.team_1_score)}</b></div><div class="post-scoreline"><span>${escape(r.team_2_name)}</span><b>${number(r.team_2_score)}</b></div><div class="post-result-footer"><span class="post-small">Final${r.tie_ind ? ' · Tie' : ''}</span></div></div>`).join('');
    }
    // This publication view exposes only completed college events in the current season.
    const newest = await api.read('v_post_tournament_team_standings', { ...season, ends_on: `lte.${context.current_league_date}`, order: 'ends_on.desc,scheduled_event_guid.asc,team_placement.asc,team_guid.asc', limit: 1 }, force);
    if (!newest.length) return html + empty('No completed college individual tournaments are available this season.');
    const day = newest[0].ends_on;
    const teams = await readAll('v_post_tournament_team_standings', { ...season, ends_on: `eq.${day}`, team_placement: 'lte.4', order: 'event_name.asc,scheduled_event_guid.asc,team_placement.asc,team_guid.asc' }, force);
    const events = new Map();
    for (const row of teams) {
      if (!events.has(row.scheduled_event_guid)) events.set(row.scheduled_event_guid, { ...row, teams: [] });
      events.get(row.scheduled_event_guid).teams.push(row);
    }
    for (const [id, event] of events) {
      html += `<section class="post-tournament"><div class="post-kicker">Season ${escape(event.game_season_number)} · ${escape(event.season_code?.replace(/_/g, '–'))}</div><h3>${escape(event.event_name)}</h3><p class="post-small">${escape(date(event.ends_on))}</p>`;
      if (!wrestlers) {
        html += `<table aria-label="${escape(event.event_name)} team standings"><thead><tr><th>Place</th><th>College team</th><th class="post-number">Points</th></tr></thead><tbody>${event.teams.map(r => `<tr><td>${number(r.team_placement)}</td><td>${escape(r.team_name)}</td><td class="post-number">${r.team_score == null ? '—' : number(r.team_score)}</td></tr>`).join('')}</tbody></table>`;
      } else {
        const rows = await readAll('v_individual_tournament_results', { ...season, scheduled_event_guid: `eq.${id}`, final_placement: 'lte.4', order: 'weight_class_code.asc,final_placement.asc,wrestler_guid.asc' }, force);
        const weights = [...new Set(rows.map(r => r.weight_class_code))].sort((a, b) => (a === 'HWT' ? 999 : Number(a)) - (b === 'HWT' ? 999 : Number(b)));
        if (!weights.length) html += empty('Wrestler placements are not available for this tournament.');
        for (const weight of weights) {
          html += `<h4 class="post-weight-heading">${escape(weight === 'HWT' ? 'Heavyweight' : weight + ' lb')}</h4><table aria-label="${escape(event.event_name)} ${escape(weight)} placements"><thead><tr><th>Place</th><th>Wrestler</th><th>College team</th></tr></thead><tbody>${rows.filter(r => r.weight_class_code === weight).map(r => `<tr><td>${number(r.final_placement)}</td><td>${escape(r.wrestler_name)}</td><td>${escape(r.team_name)}</td></tr>`).join('')}</tbody></table>`;
        }
      }
      html += '</section>';
    }
    return html;
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
      const html = current.page === 'rankings' ? await rankings(current.query, force) : current.page === 'results' ? await results(current.query, force) : current.page === 'recruiting' ? await recruiting(force) : await opinion(current.query, force);
      if (sequence !== renderSequence) return;
      main.innerHTML = html; sidebar.innerHTML = sidebarMarkup();
      document.getElementById('edition').textContent = `${context.season_code?.replace(/_/g, '–') || 'Current season'} · ${date(context.current_league_date)} · National edition`;
      document.title = `${current.page === 'results' ? 'Box Scores' : current.page[0].toUpperCase() + current.page.slice(1)} | The SimWrestling Post`;
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
