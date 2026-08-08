/**
 * agency.js - Nysterys Agency Dashboard. Vanilla JS IIFE, no framework, no
 * Supabase SDK. Served UNMINIFIED at nysterys.com/shared/, so these comments
 * ship to viewers; keep them proportionate.
 *
 * Fetches one campaign/payment payload from the agency-dashboard edge function
 * and renders it read-only for a brand or music agency. Three scopes drive the
 * layout: 'campaigns_only', 'payments_only', or 'campaigns_and_payments' (tabs).
 *
 * @security The access token lives in the URL fragment (#t=...), so the browser
 *           never sends it to any server in the request line, access logs, or
 *           Referer headers. It reaches the edge function only as an
 *           Authorization: Bearer header on the one fetch (see init).
 * @security All user-supplied content is written via textContent, never
 *           innerHTML. Every outbound link runs through safeLink (http/https
 *           only) so a stored javascript: URL cannot execute.
 * @see docs/CODEBASE.md, CLAUDE.md "Agency Dashboard"
 */
(function () {
  'use strict';

  var EDGE = 'https://rnntuxabccnphfvvvaks.supabase.co/functions/v1/agency-dashboard';

  /**
   * The dashboard token, captured by init from the URL fragment.
   *
   * Held in the IIFE closure (never on window) so only this file can read it.
   * Needed beyond the initial fetch because an invoice download re-authorizes
   * against the same token at click time.
   */
  var AUTH_TOKEN = '';

  /**
   * Static creator bios keyed by creator_name. There is no bio column in the
   * DB, so update these by hand when the copy changes. handle, follower_count,
   * and avatar_url come from the API payload (not here).
   *
   * @gotcha The wider CREATORS name->handle/bio/followers/avatar mapping lives
   *         in CLAUDE.md "Agency Dashboard"; keep both in sync when stats move.
   */
  var CREATOR_BIOS = {
    'Mys Nijsters': 'Breakout lifestyle and trend creator. Known for her magnetic energy, swag-forward content, and deeply personal storytelling — she has built one of the most engaged young audiences on the platform.',
    'Kym Nijsters': 'Lifestyle and fashion creator known for her fit checks, authentic storytelling, and relatable everyday content. With a natural presence on camera and a growing, engaged community, she consistently connects with her audience on a personal level.',
  };

  // ── DOM helpers ─────────────────────────────────────────────────────────────

  function el(tag, className) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    return e;
  }

  function append(parent) {
    for (var i = 1; i < arguments.length; i++) {
      parent.appendChild(arguments[i]);
    }
    return parent;
  }

  // ── Inline SVG icons ──────────────────────────────────────────────────────────
  // Geometric 16-grid glyphs mirroring the hub's Icon.js (1.5 stroke, currentColor,
  // miter joins). They replace emoji/dingbats, which the brand bans as functional
  // UI on every surface. Color is always inherited from the host via currentColor;
  // every icon is aria-hidden since it always pairs with a real text label.
  // @see CLAUDE.md "No emoji or decorative dingbats anywhere as functional UI".

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs) {
    var e = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) { if (attrs.hasOwnProperty(k)) e.setAttribute(k, attrs[k]); }
    return e;
  }

  // Each entry lists the child primitives drawn on a 0 0 16 16 grid. Filled
  // shapes (note heads, play triangle) carry their own fill/stroke overrides.
  var ICON_PATHS = {
    music: [
      { t: 'path',   a: { d: 'M6 11V3l7-1.5v8' } },
      { t: 'circle', a: { cx: '4', cy: '11', r: '2', fill: 'currentColor', stroke: 'none' } },
      { t: 'circle', a: { cx: '11', cy: '9.5', r: '2', fill: 'currentColor', stroke: 'none' } },
    ],
    play:  [ { t: 'path', a: { d: 'M5.5 3.5 12 8l-6.5 4.5z', fill: 'currentColor', stroke: 'none' } } ],
    copy:  [
      { t: 'rect', a: { x: '6', y: '6', width: '8', height: '8', rx: '1.5' } },
      { t: 'path', a: { d: 'M3.5 10.5V4.5A1.5 1.5 0 0 1 5 3h5.5' } },
    ],
    check: [ { t: 'path', a: { d: 'M3.5 8.5l3 3 6-7' } } ],
    clock: [
      { t: 'circle', a: { cx: '8', cy: '8', r: '5.5' } },
      { t: 'path',   a: { d: 'M8 4.5V8l2.5 1.5' } },
    ],
    bolt:    [ { t: 'path', a: { d: 'M9 1.5 3.5 9H8l-1 5.5L13 7H8.5z' } } ],
    // Opens-in-a-new-tab affordance: arrow leaving an open-cornered box.
    'arrow-out': [
      { t: 'path', a: { d: 'M8.5 3.5h4v4' } },
      { t: 'path', a: { d: 'M12.5 3.5 7 9' } },
      { t: 'path', a: { d: 'M10.5 9.5v3.5h-8V5h3.5' } },
    ],
    chevron: [ { t: 'path', a: { d: 'M6 4l4 4-4 4' } } ], // points right; rotate 90deg when open
    ban:   [
      { t: 'circle', a: { cx: '8', cy: '8', r: '5.5' } },
      { t: 'path',   a: { d: 'M4.1 4.1l7.8 7.8' } },
    ],
    // Page with a cut corner + two rule lines. Straight segments only, to sit
    // with the rects and plain paths the rest of the set is built from.
    doc: [
      { t: 'path', a: { d: 'M3.5 1.5h5.25L12.5 5.25v9.25h-9z' } },
      { t: 'path', a: { d: 'M8.75 1.5v3.75h3.75' } },
      { t: 'path', a: { d: 'M5.75 9h4.5' } },
      { t: 'path', a: { d: 'M5.75 11.5h3' } },
    ],
  };

  /**
   * Build a decorative inline SVG icon by name.
   *
   * @param {string} name - an ICON_PATHS key.
   * @param {number} [size=14] - rendered px (sets width + height).
   * @param {string} [className] - optional class for color/spacing hooks.
   * @returns {SVGElement|null} the <svg>, or null for an unknown name.
   */
  function icon(name, size, className) {
    var defs = ICON_PATHS[name];
    if (!defs) return null;
    var s = size || 14;
    var svg = svgEl('svg', {
      viewBox: '0 0 16 16',
      width: s, height: s,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.5',
      'stroke-linejoin': 'miter',
      'aria-hidden': 'true',
      focusable: 'false',
    });
    if (className) svg.setAttribute('class', className);
    defs.forEach(function (d) { svg.appendChild(svgEl(d.t, d.a)); });
    return svg;
  }

  /**
   * Gate a user-supplied URL down to http/https before it becomes an href.
   *
   * @returns {string|null} the URL when it parses to http(s), else null.
   * @security The single chokepoint for outbound links; blocks javascript:,
   *           data:, and other schemes from any DB-sourced URL (post_url,
   *           music_url, avatar_url, payment addresses).
   */
  function safeLink(url) {
    if (!url) return null;
    try {
      var u = new URL(url);
      return (u.protocol === 'https:' || u.protocol === 'http:') ? url : null;
    } catch (e) { return null; }
  }

  // ── Formatters ──────────────────────────────────────────────────────────────

  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function fmtDate(s) {
    if (!s) return '—';
    try {
      var parts = s.split('-');
      var y = parseInt(parts[0], 10);
      var m = parseInt(parts[1], 10);
      var d = parseInt(parts[2], 10);
      if (isNaN(y) || isNaN(m) || isNaN(d)) return s;
      return MONTHS[m - 1] + ' ' + d + ', ' + y;
    } catch (e) { return s; }
  }

  function fmtDateShort(s) {
    if (!s) return '—';
    try {
      var parts = s.split('-');
      var m = parseInt(parts[1], 10);
      var d = parseInt(parts[2], 10);
      return isNaN(m) ? s : MONTHS[m - 1] + ' ' + d;
    } catch (e) { return s; }
  }

  function fmtMoney(n) {
    if (n == null) return '—';
    var num = Number(n);
    if (isNaN(num)) return '—';
    return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtNum(n) {
    if (n == null || n === '') return '—';
    var v = Number(n);
    if (isNaN(v)) return '—';
    if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
    if (v >= 1000)    return (v / 1000).toFixed(1) + 'K';
    return String(v);
  }

  function fmtRate(r) {
    if (r == null) return '—';
    return Number(r).toFixed(1) + '%';
  }

  function fmtTrack(t) {
    if (!t) return t;
    return t.replace(/-/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
  }

  /**
   * TikTok's track title for creator-uploaded audio, in every language it has
   * been observed emitting. A CATEGORY, never a title. @see musicMatched
   *
   * @gotcha Matching only the English string covered 1,786 of our ~1,910
   *   original-sound posts. The other 124 arrive in six other languages and were
   *   treated as real track titles, so two unrelated posts both reporting
   *   "Originalton" compared equal and a genuine deviation rendered as
   *   "Confirmed" - the exact failure the guard below exists to prevent.
   * @invariant Entries come only from labels observed in yt_dlp_metadata, never
   *   guessed: a wrong entry suppresses a real title, which is worse than the
   *   miss it fixes. Mirrored in hub-src/src/utils/campaignSound.js.
   */
  var ORIGINAL_SOUND_LABELS = [
    'original sound', 'som original', 'sonido original', 'son original',
    'originalton', 'оригинальный звук', 'orijinal ses', '오리지널 사운드'
  ];

  /**
   * Is this normalised track name the creator-uploaded-audio label?
   *
   * @param {string} normalised - a track name already through normTrack.
   * @gotcha TikTok appends the crediting account to some localisations
   *   ("오리지널 사운드 - M2"). normTrack has already turned that dash into a
   *   space, so the test is the label followed by a SPACE, not a dash.
   * @gotcha The trailing space in that test is load-bearing: a bare startsWith
   *   would swallow a real title like "Original Sounds Of Summer".
   */
  function isOriginalSound(normalised) {
    if (!normalised) return false;
    for (var i = 0; i < ORIGINAL_SOUND_LABELS.length; i++) {
      var label = ORIGINAL_SOUND_LABELS[i];
      if (normalised === label || normalised.indexOf(label + ' ') === 0) return true;
    }
    return false;
  }

  function normTrack(t) {
    return t ? t.toLowerCase().replace(/-/g, ' ').trim() : '';
  }

  function musicUrlMatch(contractedUrl, contractedId, actualUrl, actualId) {
    if (!contractedUrl || !actualUrl) return false;
    if (contractedId && actualId) return contractedId === actualId;
    return contractedUrl === actualUrl;
  }

  /**
   * True when a deliverable's brief and its live audio are the same sound.
   *
   * The single home for that question. Five call sites (the Sounds Checked KPI,
   * the Sound Check panel, the mobile card, the campaign-row flag and the
   * expanded music sub-row) each used to inline the same urlMatch||trackMatch
   * pair, and one of them had already drifted to its own copy of normTrack.
   *
   * @gotcha "original sound" is TikTok's label for ANY creator-uploaded audio,
   *   so it is a category and not a title. Two unrelated posts both carry it,
   *   which made the track-name comparison report a match on a label collision
   *   and rendered a real deviation as "Confirmed". When either side is an
   *   original sound the track name proves nothing and only the music ID can
   *   decide, so the name test is skipped entirely rather than trusted.
   * @param {object} m - the deliverable's `music` object from the edge function
   * @returns {boolean} true only when brief and actual are genuinely the same sound
   */
  function musicMatched(m) {
    if (!m) return false;
    if (musicUrlMatch(m.contracted_url, m.contracted_music_id, m.actual_url, m.actual_music_id)) return true;
    if (!m.contracted_track || !m.actual_track) return false;
    var c = normTrack(m.contracted_track), a = normTrack(m.actual_track);
    if (isOriginalSound(c) || isOriginalSound(a)) return false;
    return c === a;
  }

  /**
   * The Sound cell of one deliverable row: what this post used, and whether that
   * is what the brief asked for.
   *
   * This is where sound compliance LIVES. It replaced a standalone Sound Check
   * panel that re-listed every post in its own table below the campaign list.
   * That panel cost 2,049px (43% of the page) to say "Confirmed" 20 times, and
   * its weekly date-range group headers alone were 619px, which is the same
   * failure the campaign list was rebuilt to remove. Proof now reads in three
   * layers instead: the KPI states the rate, the campaign row flags a deviation
   * without being expanded, and this cell carries the per-post evidence.
   *
   * @gotcha A deviation shows the sound ACTUALLY used, not the briefed one. The
   *   brief is the known quantity; what the agency does not know is what it got
   *   instead. The full brief-vs-used pair stays in the `music-row` sub-row
   *   directly beneath, which renders on exactly this condition.
   * @param {object|null} m - the deliverable's `music` object
   * @returns {HTMLElement} a `<td>`, never null, so column counts stay aligned
   */
  function soundCell(m) {
    var td = el('td', 'sound-cell');
    var hasBrief  = !!(m && (m.contracted_url || m.contracted_track));
    var hasActual = !!(m && (m.actual_url     || m.actual_track));

    if (!hasBrief && !hasActual) { td.className = 'sound-cell sound-none'; td.textContent = '—'; return td; }

    // Not posted yet: the brief is all there is, and nothing is claimed about it.
    if (!hasActual) {
      td.className = 'sound-cell sound-pending';
      td.appendChild(soundText(m.contracted_track, m.contracted_artist));
      return td;
    }

    var mark = el('span', 'sound-mark');
    if (!hasBrief)                 { td.className = 'sound-cell sound-unbriefed'; }
    else if (musicMatched(m))      { td.className = 'sound-cell sound-ok';  mark.textContent = '✓'; }
    else                           { td.className = 'sound-cell sound-off'; mark.textContent = '≠'; }
    if (mark.textContent) td.appendChild(mark);
    td.appendChild(soundText(m.actual_track, m.actual_artist));
    if (!hasBrief) {
      var note = el('span', 'sound-nobrief');
      note.textContent = 'no brief';
      td.appendChild(note);
    }
    return td;
  }

  /** Track + artist as one inline fragment. @see soundCell */
  function soundText(track, artist) {
    var frag = el('span', 'sound-text');
    var t = el('span', 'sound-track');
    t.textContent = track ? fmtTrack(track) : '—';
    frag.appendChild(t);
    if (artist) {
      var a = el('span', 'sound-artist');
      a.textContent = artist;
      frag.appendChild(a);
    }
    return frag;
  }

  // ── Badge ────────────────────────────────────────────────────────────────────

  function badge(status) {
    var b = el('span', 'badge badge-' + (status || 'default').replace(/\s+/g, '-'));
    b.textContent = status || '';
    return b;
  }

  // ── Count-up animation ────────────────────────────────────────────────────────

  // Respect the OS "reduce motion" setting: skip the count-up entirely.
  var REDUCE_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function countUp(el, target, fmtFn, duration) {
    if (!target || target <= 0) { el.textContent = fmtFn(0); return; }
    if (REDUCE_MOTION) { el.textContent = fmtFn(target); return; }
    duration = duration || 1400;
    var steps = 55;
    var interval = Math.max(duration / steps, 14);
    var step = 0;
    var timer = setInterval(function () {
      step++;
      var progress = step / steps;
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = fmtFn(Math.round(eased * target));
      if (step >= steps) { el.textContent = fmtFn(target); clearInterval(timer); }
    }, interval);
  }

  // ── Compute summary stats from campaign data ─────────────────────────────────

  /**
   * Aggregate the KPI-strip numbers across every campaign's deliverables.
   *
   * @returns {object} totalViews, totalLikes, avgER, avgCompletion (null when
   *          no watch-time data), campaignCount, postsDelivered, totalPosts.
   * @gotcha Cancelled deliverables are skipped entirely (not counted in
   *         totalPosts or any total). Status strings must be exact title-case
   *         ('Cancelled', 'Posted'); a casing change in the payload silently
   *         drops the row from the count. @see the payment-bucket title-case
   *         rule in renderPayments.
   */
  function computeSummary(campaigns) {
    var totalViews = 0, totalLikes = 0, totalER = 0, erCount = 0;
    var totalCompletion = 0, completionCount = 0;
    var postsDelivered = 0, totalPosts = 0;
    campaigns.forEach(function (c) {
      c.deliverables.forEach(function (d) {
        if (d.status === 'Cancelled') return;
        totalPosts++;
        if (d.status === 'Posted') postsDelivered++;
        if (d.stats) {
          totalViews += d.stats.views    || 0;
          totalLikes += d.stats.likes    || 0;
          totalER    += d.stats.engagement_rate || 0;
          erCount++;
          if (d.stats.completion_pct != null) {
            totalCompletion += d.stats.completion_pct;
            completionCount++;
          }
        }
      });
    });
    return {
      totalViews:     totalViews,
      totalLikes:     totalLikes,
      avgER:          erCount > 0 ? (totalER / erCount) : 0,
      avgCompletion:  completionCount > 0 ? (totalCompletion / completionCount) : null,
      campaignCount:  campaigns.length,
      postsDelivered: postsDelivered,
      totalPosts:     totalPosts,
    };
  }

  // ── Error screen ──────────────────────────────────────────────────────────────

  // icon: a big typographic glyph (404/?/!), or svg: an ICON_PATHS name for the
  // states whose natural mark would otherwise be an emoji/dingbat.
  var ERRORS = {
    'expired':      { svg: 'ban',   title: 'THIS LINK HAS EXPIRED', body: 'This dashboard is no longer accessible. Contact the creator for updated access.' },
    'not-found':    { icon: '404',  title: 'Dashboard not found',   body: 'This link has been deactivated. Contact the creator for a new link.' },
    'no-token':     { icon: '?',    title: 'Invalid link',          body: 'No dashboard token was found in this URL.' },
    'timeout':      { svg: 'clock', title: 'Request timed out',     body: 'The server took too long to respond. Please try again in a moment.' },
    'network':      { svg: 'bolt',  title: 'Connection error',      body: 'Unable to load the dashboard. Check your connection and try again.' },
    'server-error': { icon: '!',    title: 'Server error',          body: 'Something went wrong on our end. Please try again shortly.' },
  };

  /**
   * Replace the loading state with a full-screen error keyed by type.
   *
   * @param {string} type - one of the ERRORS keys; falls back to 'server-error'.
   * @param {string} [expiresAt] - ISO timestamp; for type 'expired' only, stamps
   *        the exact expiry date under the message.
   */
  function showError(type, expiresAt) {
    var cfg = ERRORS[type] || ERRORS['server-error'];
    document.getElementById('loading-state').hidden = true;
    var iconHost = document.getElementById('error-icon');
    iconHost.textContent = '';
    if (cfg.svg) {
      var ig = icon(cfg.svg, 40);
      if (ig) iconHost.appendChild(ig);
    } else {
      iconHost.textContent = cfg.icon;
    }
    document.getElementById('error-title').textContent = cfg.title;
    document.getElementById('error-body').textContent  = cfg.body;

    // For expired state: show the exact date it expired below the body
    var existing = document.getElementById('error-date-stamp');
    if (existing) existing.remove();
    if (type === 'expired' && expiresAt) {
      var stamp = document.createElement('p');
      stamp.id = 'error-date-stamp';
      stamp.className = 'error-date-stamp';
      stamp.textContent = 'Expired ' + fmtDate(expiresAt.split('T')[0]);
      document.getElementById('error-body').insertAdjacentElement('afterend', stamp);
    }

    var errorState = document.getElementById('error-state');

    // Transient failures promise "try again" in the copy, so give them a real
    // retry control (the static back-home link is not a recovery path).
    var existingRetry = document.getElementById('error-retry');
    if (existingRetry) existingRetry.remove();
    var TRANSIENT = { 'timeout': 1, 'network': 1, 'server-error': 1 };
    if (TRANSIENT[type]) {
      var retry = document.createElement('button');
      retry.id = 'error-retry';
      retry.type = 'button';
      retry.className = 'error-retry-btn';
      retry.textContent = 'Try again';
      retry.addEventListener('click', function () {
        errorState.setAttribute('hidden', '');
        document.getElementById('loading-state').hidden = false;
        init();
      });
      errorState.insertBefore(retry, document.querySelector('#error-state .back-home-link'));
    }

    errorState.dataset.type = type;
    errorState.removeAttribute('hidden');
  }

  // ── Creator hero ──────────────────────────────────────────────────────────────
  // Hero now shows only the creator's global credential (followers).
  // Campaign-scoped numbers (views, engagement, posts) live in the KPI strip.

  /**
   * Render the hero: avatar (with initial fallback), handle, first name, static
   * bio, agency name, and the live follower count from the payload.
   *
   * @security avatar_url is assigned to img.src directly (not via safeLink);
   *           the page CSP img-src restricting to https: + data: is what blocks
   *           a hostile scheme here. @see agency.css / CLAUDE.md "Agency CSP".
   */
  function renderCreatorHero(dash) {
    var avatarEl = document.getElementById('hero-avatar');

    // Avatar - src set directly; mitigated by CSP img-src restricting to https: + data:
    if (dash.avatar_url) {
      avatarEl.src = dash.avatar_url;
      avatarEl.alt = dash.creator_name || '';
      avatarEl.onerror = function () {
        this.style.display = 'none';
        var init = el('div', 'hero-avatar-initial');
        init.textContent = (dash.creator_name || '?').charAt(0).toUpperCase();
        this.parentNode.insertBefore(init, this);
      };
    } else {
      avatarEl.style.display = 'none';
      var init = el('div', 'hero-avatar-initial');
      init.textContent = (dash.creator_name || '?').charAt(0).toUpperCase();
      avatarEl.parentNode.insertBefore(init, avatarEl);
    }

    // All text via textContent - no innerHTML
    document.getElementById('hero-handle').textContent      = dash.handle || '';
    document.getElementById('hero-name').textContent        = (dash.creator_name || '').split(' ')[0];
    document.getElementById('hero-bio').textContent         = CREATOR_BIOS[dash.creator_name] || '';
    document.getElementById('hero-agency-name').textContent = dash.agency_name || '';

    // Followers - from live DB value via API, shown inline on the handle line
    var handleEl  = document.getElementById('hero-handle');
    var followers = dash.follower_count || null;
    if (followers && handleEl) {
      var sep = el('span', 'hero-handle-sep');
      sep.textContent = '·';
      var fol = el('span', 'hero-handle-followers');
      fol.textContent = fmtNum(followers) + ' followers';
      append(handleEl, sep, fol);
    }

    // Clear unused stats container
    var statsEl = document.getElementById('hero-stats');
    if (statsEl) statsEl.style.display = 'none';
  }

  // ── KPI strip - campaign-scoped performance numbers ───────────────────────────

  /**
   * Build the campaign-scoped KPI cells (views, engagement, posts, campaigns,
   * plus optional completion / CPM / music-compliance cells when their data
   * exists). No-op when there are no campaigns.
   *
   * @gotcha The music-compliance cell appears only when agency_type contains
   *         'music' (case-insensitive). CPM appears only when non-in-kind
   *         invoice amounts and views are both present.
   */
  function renderKpiStrip(campaigns, summary, dash) {
    var kpiEl = document.getElementById('kpi-strip');
    if (!kpiEl) return;
    if (summary.campaignCount === 0) return;

    var postsLabel = summary.totalPosts > 0
      ? summary.postsDelivered + '/' + summary.totalPosts
      : (summary.postsDelivered > 0 ? String(summary.postsDelivered) : '—');

    var items = [
      {
        val:   summary.totalViews > 0 ? fmtNum(summary.totalViews) : '—',
        label: 'Total Views Delivered',
        raw:   summary.totalViews,
        anim:  summary.totalViews > 0,
      },
      {
        val:   summary.avgER > 0 ? summary.avgER.toFixed(1) + '%' : '—',
        label: 'Average Engagement',
        tip:   'Engagement rate: likes, comments and shares as a percent of views.',
      },
      {
        val:   postsLabel,
        label: 'Posts Delivered',
        tip:   'Posts published versus the number contracted.',
      },
      {
        val:   String(summary.campaignCount),
        label: summary.campaignCount === 1 ? 'Campaign' : 'Campaigns',
      },
    ];

    // Avg Completion - only when watch time data is available
    if (summary.avgCompletion != null) {
      items.push({
        val:   summary.avgCompletion.toFixed(1) + '%',
        label: 'Avg Video Completion',
        tip:   'Average share of each video watched to the end.',
      });
    }

    // CPM - only when invoice data exists and views are known
    var totalInvoiced = 0;
    campaigns.forEach(function (c) {
      if (c.payment && !c.payment.is_in_kind && c.payment.amount) {
        totalInvoiced += Number(c.payment.amount) || 0;
      }
    });
    if (totalInvoiced > 0 && summary.totalViews > 0) {
      var cpm = (totalInvoiced / summary.totalViews) * 1000;
      items.push({
        val:   '$' + cpm.toFixed(2),
        label: 'Cost Per 1K Views',
        tip:   'CPM: campaign spend per 1,000 views delivered.',
      });
    }

    // Sound compliance - music agencies only.
    //
    // A deliverable is only CHECKABLE when a sound was briefed on it: with no
    // contracted track there is nothing to compare the live audio against.
    // scTotal is therefore the briefed count, NOT the post count, and the tile
    // states that denominator against the delivered total. Reporting a bare
    // 'All Confirmed' beside '23/23 Posts Delivered' read as all 23 posts
    // verified when only 2 carried a brief, which overclaims to the agency.
    var agencyType = dash && dash.agency_type ? dash.agency_type : '';
    if (agencyType.toLowerCase().indexOf('music') !== -1) {
      var scConfirmed = 0, scMismatched = 0, scTotal = 0, scDelivered = 0;
      campaigns.forEach(function (c) {
        (c.deliverables || []).forEach(function (d) {
          if (d.status !== 'Cancelled') scDelivered++;
          var mu = d.music;
          if (!mu || (!mu.contracted_url && !mu.contracted_track)) return;
          scTotal++;
          var hasActual  = !!(mu.actual_url || mu.actual_track);
          if (hasActual && musicMatched(mu)) scConfirmed++;
          else if (hasActual) scMismatched++;
        });
      });
      if (scTotal > 0) {
        var scVal, scColor;
        if (scMismatched > 0) {
          scVal   = scMismatched + (scMismatched === 1 ? ' Mismatch' : ' Mismatches');
          scColor = 'var(--orange2)';
        } else if (scConfirmed === scTotal) {
          scVal = scTotal + ' of ' + scDelivered;
          // Green only when every delivered post was actually checked. On
          // partial coverage it would read as a clean bill of health for the
          // whole campaign when most posts were never compared to anything.
          scColor = scTotal === scDelivered ? 'var(--green)' : null;
        } else {
          scVal   = scConfirmed + '/' + scTotal + ' Confirmed';
          scColor = null;
        }
        var unbriefed = scDelivered - scTotal;
        items.push({
          val:   scVal,
          label: 'Sounds Checked',
          color: scColor,
          tip:   'Posts where the audio used was compared against the contracted track.',
          note:  unbriefed > 0
            ? unbriefed + (unbriefed === 1 ? ' post has' : ' posts have') + ' no contracted sound on file'
            : null,
        });
      }
    }

    items.forEach(function (item) {
      var cell  = el('div', 'kpi-cell');
      var valEl = el('div', 'kpi-value');
      valEl.textContent = item.val;
      if (item.color) valEl.style.color = item.color;
      var lblEl = el('div', 'kpi-label');
      lblEl.textContent = item.label;
      if (item.tip) lblEl.title = item.tip;
      append(cell, valEl, lblEl);
      if (item.note) {
        var noteEl = el('div', 'kpi-note');
        noteEl.textContent = item.note;
        cell.appendChild(noteEl);
      }
      kpiEl.appendChild(cell);

      if (item.anim) {
        setTimeout(function () {
          countUp(valEl, item.raw, fmtNum, 1500);
        }, 600);
      }
    });

    kpiEl.removeAttribute('hidden');
  }

  // ── Performance charts ────────────────────────────────────────────────────────

  /**
   * Rows drawn in each performance chart.
   *
   * @invariant Both charts use this same cap. They sit side by side, so a
   *            per-campaign chart that grew with the roster while the posts
   *            chart stayed fixed left the pair badly mismatched in height
   *            (19 bars against 8) and pushed the campaign list a screen down.
   *            A chart is a headline, not a record: the full per-campaign
   *            numbers live in the campaign list below.
   */
  var CHART_ROWS = 8;

  function buildChartRows(barsEl, items, max, delayBase) {
    items.forEach(function (item, i) {
      var row = el('div', 'chart-row');
      row.style.animationDelay = (i * 0.06) + 's';

      var labelEl = el('div', 'chart-label');
      labelEl.textContent = item.label;
      if (item.title) labelEl.title = item.title;

      var track = el('div', 'chart-track');
      var fill  = el('div', 'chart-fill');
      track.appendChild(fill);

      var valEl = el('div', 'chart-value');
      valEl.textContent = item.value;

      if (item.sub) {
        var subEl = el('div', 'chart-sub');
        subEl.textContent = item.sub;
        var valWrap = el('div', 'chart-value-wrap');
        append(valWrap, valEl, subEl);
        append(row, labelEl, track, valWrap);
      } else {
        append(row, labelEl, track, valEl);
      }

      barsEl.appendChild(row);

      setTimeout(function () {
        fill.style.width = ((item.views / max) * 100) + '%';
      }, (delayBase || 120) + i * 70);
    });
  }

  function renderPerfChart(campaigns) {
    // ── Chart 1: avg views per post ──
    var avgItems = [];
    campaigns.forEach(function (c) {
      var totalViews = 0, postCount = 0;
      c.deliverables.forEach(function (d) {
        if (d.stats && d.stats.views > 0) {
          totalViews += d.stats.views;
          postCount++;
        }
      });
      if (postCount > 0) {
        avgItems.push({
          label: fmtDateShort(c.start_date),
          title: c.name || '',
          views: Math.round(totalViews / postCount),
          value: fmtNum(Math.round(totalViews / postCount)) + ' avg',
          sub:   postCount + (postCount === 1 ? ' post' : ' posts'),
        });
      }
    });

    if (avgItems.length === 0) return;
    avgItems.sort(function (a, b) { return b.views - a.views; });
    var avgTotal = avgItems.length;
    var avgTop   = avgItems.slice(0, CHART_ROWS);

    // Say so when the chart is a top-N rather than the whole roster; a silently
    // truncated chart reads as "these are all the campaigns".
    if (avgTotal > CHART_ROWS) {
      document.getElementById('perf-chart-sub').textContent =
        'Top ' + CHART_ROWS + ' of ' + avgTotal + ' campaigns, normalized per post';
    }

    var section = document.getElementById('perf-chart-section');
    buildChartRows(document.getElementById('perf-chart-bars'), avgTop, avgTop[0].views, 120);
    section.removeAttribute('hidden');

    // ── Chart 2: top individual posts ──
    // The sub-line names the sound, not the agency: every campaign on a shared
    // dashboard belongs to the same agency, so that label repeated one constant
    // string down the whole chart.
    var allPosts = [];
    campaigns.forEach(function (c) {
      c.deliverables.forEach(function (d) {
        if (d.stats && d.stats.views > 0) {
          var m = d.music;
          var track = m && (m.actual_track || m.contracted_track);
          allPosts.push({
            label: fmtDateShort(d.posted_date || d.due_date),
            title: track ? fmtTrack(track) : '',
            views: d.stats.views,
            value: fmtNum(d.stats.views) + ' views',
            sub:   track ? fmtTrack(track) : '',
          });
        }
      });
    });

    if (allPosts.length === 0) return;
    allPosts.sort(function (a, b) { return b.views - a.views; });
    var topPosts = allPosts.slice(0, CHART_ROWS);

    var topPanel = document.getElementById('top-posts-panel');
    buildChartRows(document.getElementById('top-posts-bars'), topPosts, topPosts[0].views, 200);
    topPanel.removeAttribute('hidden');
  }

  // ── Campaign stats aggregate ───────────────────────────────────────────────────

  function sumStats(deliverables) {
    var totals = { views: 0, likes: 0, comments: 0, shares: 0, erSum: 0, erCount: 0, hasStats: false };
    deliverables.forEach(function (d) {
      if (d.stats) {
        totals.views    += d.stats.views    || 0;
        totals.likes    += d.stats.likes    || 0;
        totals.comments += d.stats.comments || 0;
        totals.shares   += d.stats.shares   || 0;
        if (d.stats.engagement_rate > 0) {
          totals.erSum   += d.stats.engagement_rate;
          totals.erCount += 1;
        }
        totals.hasStats = true;
      }
    });
    totals.avgER = totals.erCount > 0 ? totals.erSum / totals.erCount : null;
    return totals;
  }
  // ── Mobile deliverable card ───────────────────────────────────────────────────

  /**
   * Build one compact deliverable card for the mobile (<=768px) layout, which
   * replaces the desktop stats table. @see renderCampaigns for the isMobile switch.
   *
   * @returns {HTMLElement} the card element (thumb, platform/status, date,
   *          stats line, optional music-check row).
   */
  function renderDeliverableMobileCard(d) {
    var card = el('div', 'mobile-deliv-card');
    var top  = el('div', 'mobile-deliv-top');

    // Thumbnail
    var imgUrl   = safeLink(d.cover_image_url);
    var postHref = safeLink(d.post_url);
    var thumb    = postHref ? el('a', 'mobile-deliv-thumb') : el('div', 'mobile-deliv-thumb');
    if (postHref) { thumb.href = postHref; thumb.target = '_blank'; thumb.rel = 'noopener noreferrer'; }
    if (imgUrl) {
      var img = el('img');
      img.src = imgUrl; img.alt = ''; img.loading = 'lazy';
      img.onerror = function () {
        var ph = el('div', 'mobile-deliv-thumb-ph'); ph.appendChild(icon('play', 16));
        this.parentNode.innerHTML = ''; this.parentNode.appendChild(ph);
      };
      thumb.appendChild(img);
    } else {
      var ph = el('div', 'mobile-deliv-thumb-ph'); ph.appendChild(icon('play', 16));
      thumb.appendChild(ph);
    }
    top.appendChild(thumb);

    // Info
    var info = el('div', 'mobile-deliv-info');

    var metaRow = el('div', 'mobile-deliv-meta');
    var platEl  = el('span', 'mobile-deliv-platform');
    platEl.textContent = d.platform || '—';
    metaRow.appendChild(platEl);
    metaRow.appendChild(badge(d.status));
    info.appendChild(metaRow);

    var dateEl = el('div', 'mobile-deliv-date');
    dateEl.textContent = d.posted_date
      ? ('Posted ' + fmtDateShort(d.posted_date))
      : (d.due_date ? ('Due ' + fmtDateShort(d.due_date)) : '—');
    info.appendChild(dateEl);

    var s = d.stats;
    if (s) {
      var statParts = [];
      if (s.views > 0)              statParts.push(fmtNum(s.views) + ' views');
      if (s.engagement_rate > 0)    statParts.push(s.engagement_rate.toFixed(1) + '% ER');
      if (s.completion_pct != null) statParts.push(s.completion_pct.toFixed(1) + '% completion');
      if (statParts.length > 0) {
        var statsEl = el('div', 'mobile-deliv-stats');
        statsEl.textContent = statParts.join(' · ');
        info.appendChild(statsEl);
      }
    }

    if (postHref) {
      var lnk = el('a', 'mobile-deliv-postlink');
      lnk.href = postHref; lnk.target = '_blank'; lnk.rel = 'noopener noreferrer';
      lnk.textContent = 'View Post ↗';
      info.appendChild(lnk);
    }

    top.appendChild(info);
    card.appendChild(top);

    // Music check - compact row
    var m = d.music;
    var hasBrief  = m && (m.contracted_url || m.contracted_track);
    var hasActual = m && (m.actual_url     || m.actual_track);
    if (hasBrief || hasActual) {
      var isMatch = hasBrief && hasActual && musicMatched(m);

      var musicRow = el('div', 'mobile-deliv-music');
      musicRow.appendChild(icon('music', 12, 'mobile-deliv-music-note'));

      // Name the sound that was USED once the post is live, and fall back to the
      // brief only before it is. A deviation used to name the contracted track
      // beside "Different", which told the agency what it asked for and not what
      // it got. Mirrors the desktop Sound cell. @see soundCell
      var showTrack  = hasActual ? m.actual_track  : m.contracted_track;
      var showArtist = hasActual ? m.actual_artist : m.contracted_artist;
      if (showTrack) {
        var trackEl = el('span', 'mobile-deliv-music-track');
        trackEl.textContent = fmtTrack(showTrack) + (showArtist ? ' — ' + showArtist : '');
        musicRow.appendChild(trackEl);
      }

      var scEl = el('span', isMatch ? 'music-match' : (hasActual ? 'music-diff' : 'mobile-deliv-music-pending'));
      scEl.textContent = !hasActual ? 'Pending' : (isMatch ? '✓ Confirmed' : '≠ Different');
      musicRow.appendChild(scEl);

      card.appendChild(musicRow);
    }

    return card;
  }

  // ── Campaign identity ─────────────────────────────────────────────────────────

  /**
   * Pick the sound that names a campaign in the collapsed list.
   *
   * A music agency thinks in tracks, not date ranges, so the track headlines the
   * row and the dates demote to the sub-line. Prefers what actually went live;
   * falls back to the brief for work that has not posted yet.
   *
   * @param {object[]} delivs - the campaign's deliverables.
   * @returns {?object} {track, artist, brief, original, more} where `more`
   *          counts the additional distinct sounds in the campaign, or null
   *          when the campaign carries no identifiable sound (caller falls
   *          back to dates).
   * @gotcha TikTok reports creator-uploaded audio as the track "original
   *         sound", which names nothing. For those the CREDITED ACCOUNT
   *         becomes the headline and `original` flags the qualifier chip, so
   *         eight such campaigns read as eight distinct artists rather than
   *         eight copies of the same non-title. A post with no artist either
   *         is skipped: there is nothing to call it.
   * @gotcha Distinctness is measured on normTrack, the same normalisation the
   *         per-deliverable mismatch check uses, so 'purple-rain' and
   *         'Purple Rain' are one sound rather than two.
   */
  function campaignSound(delivs) {
    var seen = [];
    var lead = null;
    delivs.forEach(function (d) {
      var m = d.music;
      if (!m) return;
      var useActual = !!m.actual_track;
      var track = m.actual_track || m.contracted_track;
      if (!track) return;
      var artist   = useActual ? m.actual_artist : m.contracted_artist;
      var original = !!(useActual && m.actual_is_original);
      if (original && !artist) return;
      var key = normTrack(original ? artist : track);
      if (seen.indexOf(key) !== -1) return;
      seen.push(key);
      if (!lead) {
        lead = original
          ? { track: artist,          artist: null,   brief: false,      original: true  }
          : { track: fmtTrack(track), artist: artist, brief: !useActual, original: false };
      }
    });
    if (!lead) return null;
    lead.more = seen.length - 1;
    return lead;
  }

  /**
   * Roll the per-deliverable music check up to one campaign-level state.
   *
   * @returns {?string} 'diff' when any deliverable used a different sound than
   *          the brief, 'pending' when a brief has not been verified against a
   *          live post yet, or null when everything on the campaign matches.
   *          A clean campaign shows no chip at all: the flag is the exception.
   */
  function campaignMusicFlag(delivs) {
    var pending = false;
    for (var i = 0; i < delivs.length; i++) {
      var m = delivs[i].music;
      if (!m) continue;
      var hasBrief  = !!(m.contracted_url || m.contracted_track);
      var hasActual = !!(m.actual_url     || m.actual_track);
      if (!hasBrief) continue;
      if (!hasActual) { pending = true; continue; }
      if (!musicMatched(m)) return 'diff';
    }
    return pending ? 'pending' : null;
  }

  /**
   * Build the campaign identity block: sound headline over a metadata line.
   *
   * The single home for what a campaign is CALLED, used by both the campaigns
   * list and the payments table. Naming a campaign by its sound on one tab and
   * by its date range on another made the same deal look like two different
   * things, so neither tab may build this itself.
   *
   * @param {object} campaign - the campaign, with its deliverables.
   * @returns {object} `{cell, title, sub, sound, dateStr, setSub}` where `cell`
   *          is the ready-to-mount element, `title` is exposed so a caller can
   *          append tab-specific chips, and `setSub(parts)` writes the
   *          metadata line from an array joined with the standard separator.
   */
  function buildCampaignLabel(campaign) {
    var delivs   = campaign.deliverables || [];
    var sound    = campaignSound(delivs);
    var startStr = fmtDate(campaign.start_date);
    var endStr   = fmtDate(campaign.end_date);
    var dateStr  = (startStr !== '—' || endStr !== '—') ? startStr + ' – ' + endStr : '';

    var cell  = el('span', 'camp-id');
    var title = el('span', 'camp-title');
    if (sound) {
      title.appendChild(icon('music', 13, 'camp-title-note'));
      var trackEl = el('span');
      trackEl.textContent = sound.track;
      title.appendChild(trackEl);
      if (sound.original) {
        var origEl = el('span', 'camp-title-qual');
        origEl.textContent = 'Original sound';
        title.appendChild(origEl);
      }
      if (sound.more > 0) {
        var moreEl = el('span', 'camp-title-more');
        moreEl.textContent = '+' + sound.more + ' more';
        title.appendChild(moreEl);
      }
    } else {
      title.textContent = dateStr || 'Campaign';
    }
    cell.appendChild(title);

    var sub = el('span', 'camp-sub');
    cell.appendChild(sub);

    return {
      cell: cell, title: title, sub: sub, sound: sound, dateStr: dateStr,
      setSub: function (parts) {
        sub.textContent = (parts || []).filter(Boolean).join(' · ');
      },
    };
  }

  // ── Render: campaigns panel ────────────────────────────────────────────────────

  // Creates a copy-URLs button. urls = string[]. Returns null if no urls.
  // label is plain text (no leading glyph); the icon is rendered as SVG.
  function makeCopyBtn(urls, label) {
    if (!urls || urls.length === 0) return null;
    var text = label || ('Copy ' + urls.length + ' URL' + (urls.length === 1 ? '' : 's'));
    var btn = el('button', 'copy-urls-btn');
    btn.type = 'button';

    function setContent(iconName, labelText) {
      btn.textContent = '';
      btn.appendChild(icon(iconName, 13));
      var span = el('span');
      span.textContent = labelText;
      btn.appendChild(span);
    }
    setContent('copy', text);

    btn.addEventListener('click', function () {
      navigator.clipboard.writeText(urls.join('\n')).then(function () {
        setContent('check', 'Copied');
        btn.classList.add('copy-urls-btn--done');
        setTimeout(function () {
          setContent('copy', text);
          btn.classList.remove('copy-urls-btn--done');
        }, 2000);
      });
    });
    return btn;
  }

  /**
   * Build the per-campaign deliverables table (desktop layout).
   *
   * Extracted from renderCampaigns so the table can be built lazily into a
   * collapsed campaign row without duplicating the row/engagement/music markup.
   *
   * @param {object[]} delivs - the campaign's deliverables (never empty).
   * @param {number} cardIdx - the campaign's list index, used only to keep the
   *        engagement sub-row ids unique across the page.
   * @returns {HTMLElement} the .table-wrap element.
   */
  function buildDeliverablesTable(delivs, cardIdx) {
      var tableWrap = el('div', 'table-wrap');
      var table     = el('table');

      var thead = el('thead');
      var hr    = el('tr');
      // Empty header for thumb column
      var thThumb = el('th', 'thumb-col');
      hr.appendChild(thThumb);
      // Core columns only. Per-post Likes/Comments/Shares moved into a per-row
      // expand so the table scans without horizontal scroll; the campaign-stats
      // bar below already carries those totals.
      var cols  = ['Platform', 'Status', 'Due', 'Sound', 'Views', 'Completion', 'ER%'];
      var colTips = {
        'Sound':      'The audio this post used, checked against the sound the brief asked for.',
        'Completion': 'Average share of the video watched to the end.',
        'ER%':        'Engagement rate: likes, comments and shares as a percent of views.',
      };
      cols.forEach(function (c) {
        var th = el('th');
        if (['Views','Completion','ER%'].indexOf(c) !== -1) th.className = 'num-cell';
        th.textContent = c;
        if (colTips[c]) th.title = colTips[c];
        hr.appendChild(th);
      });
      hr.appendChild(el('th', 'caret-col')); // expand control column
      thead.appendChild(hr);
      table.appendChild(thead);

      var tbody = el('tbody');
      delivs.forEach(function (d, delivIdx) {
        var row = el('tr');

        function tdTxt(val, cls) {
          var td = el('td', cls || '');
          td.textContent = (val == null || val === '') ? '—' : String(val);
          return td;
        }

        // Thumbnail cell - clickable, with posted date inline to the right
        var thumbTd = el('td', 'thumb-col');
        var imgUrl  = safeLink(d.cover_image_url);
        var postUrl = safeLink(d.post_url);
        var thumbInner = el('div', 'row-thumb-inner');
        var thumbWrap = postUrl ? el('a', 'row-thumb') : el('div', 'row-thumb');
        if (postUrl) {
          thumbWrap.href   = postUrl;
          thumbWrap.target = '_blank';
          thumbWrap.rel    = 'noopener noreferrer';
        }
        if (imgUrl) {
          var img = el('img');
          img.src     = imgUrl;
          img.alt     = '';
          img.loading = 'lazy';
          img.onerror = function () {
            var ph = el('div', 'row-thumb-ph');
            ph.appendChild(icon('play', 16));
            thumbWrap.innerHTML = '';
            thumbWrap.appendChild(ph);
          };
          thumbWrap.appendChild(img);
        } else {
          var ph2 = el('div', 'row-thumb-ph');
          ph2.appendChild(icon('play', 16));
          thumbWrap.appendChild(ph2);
        }
        thumbInner.appendChild(thumbWrap);
        var rowDate = el('span', 'row-posted-date');
        rowDate.textContent = fmtDateShort(d.posted_date) || '—';
        thumbInner.appendChild(rowDate);
        thumbTd.appendChild(thumbInner);
        row.appendChild(thumbTd);

        row.appendChild(tdTxt(d.platform));

        var statusTd = el('td');
        statusTd.appendChild(badge(d.status));
        row.appendChild(statusTd);

        row.appendChild(tdTxt(fmtDate(d.due_date), 'muted-cell'));

        row.appendChild(soundCell(d.music));

        var s = d.stats;

        // Views cell - complete views shown as a muted sub-note when available
        var viewsTd = el('td', 'num-cell');
        viewsTd.textContent = s ? fmtNum(s.views) : '—';
        if (s && s.complete_views != null) {
          var cvNote = el('div', 'sub-note');
          cvNote.textContent = '~' + fmtNum(s.complete_views) + ' complete';
          viewsTd.appendChild(cvNote);
        }
        row.appendChild(viewsTd);

        // Completion - neutral, no color coding (agency lacks context to interpret thresholds)
        var compTd = el('td', 'num-cell');
        compTd.textContent = s && s.completion_pct != null ? s.completion_pct.toFixed(1) + '%' : '—';
        row.appendChild(compTd);

        row.appendChild(tdTxt(s ? fmtRate(s.engagement_rate) : '—', 'num-cell'));

        // Expand control - present only when there is per-post engagement to show.
        var hasEng = !!(s && (s.likes || s.comments || s.shares));
        var caretTd = el('td', 'caret-col');
        var caretBtn = null, engRow = null;
        if (hasEng) {
          var detailId = 'eng-' + cardIdx + '-' + delivIdx;
          caretBtn = el('button', 'row-expand');
          caretBtn.type = 'button';
          caretBtn.setAttribute('aria-expanded', 'false');
          caretBtn.setAttribute('aria-controls', detailId);
          caretBtn.setAttribute('aria-label', 'Show likes, comments and shares');
          caretBtn.appendChild(icon('chevron', 13, 'row-expand-icon'));
          caretTd.appendChild(caretBtn);
        }
        row.appendChild(caretTd);
        tbody.appendChild(row);

        // Engagement detail sub-row (Likes / Comments / Shares), collapsed by default.
        if (hasEng) {
          engRow = el('tr', 'engagement-row');
          engRow.id = detailId;
          engRow.hidden = true;
          var engTd = el('td');
          engTd.colSpan = 9; // thumb + 7 core columns + caret
          var engWrap = el('div', 'engagement-detail');
          [['Likes', s.likes], ['Comments', s.comments], ['Shares', s.shares]].forEach(function (pair) {
            var eItem = el('div', 'engagement-item');
            var eVal  = el('span', 'engagement-value');
            eVal.textContent = fmtNum(pair[1]);
            var eLbl  = el('span', 'engagement-label');
            eLbl.textContent = pair[0];
            append(eItem, eVal, eLbl);
            engWrap.appendChild(eItem);
          });
          engTd.appendChild(engWrap);
          engRow.appendChild(engTd);
          tbody.appendChild(engRow);

          caretBtn.addEventListener('click', function () {
            var open = engRow.hidden;
            engRow.hidden = !open;
            caretBtn.setAttribute('aria-expanded', String(open));
            caretBtn.classList.toggle('row-expand--open', open);
          });
        }

        // Music sub-row - ONLY for a genuine deviation, where showing the brief
        // beside what was used is the whole point. It used to also cover the
        // not-yet-posted and no-brief cases, but the Sound cell now states both
        // of those, so rendering it there reprinted the cell verbatim one line
        // lower. @see soundCell
        var m = d.music;
        var hasBrief  = m && (m.contracted_url || m.contracted_track);
        var hasActual = m && (m.actual_url     || m.actual_track);
        if (hasBrief && hasActual && !musicMatched(m)) {
          var musicRow = el('tr', 'music-row');
          var musicTd  = el('td');
          musicTd.colSpan = 9; // thumb + 7 core columns + caret

          var detail = el('div', 'music-detail');

          detail.appendChild(icon('music', 13, 'music-note'));

          function musicBlock(roleLabel, track, artist, url) {
            var block = el('div', 'music-block');
            var role  = el('span', 'music-role');
            role.textContent = roleLabel;
            block.appendChild(role);
            if (track) {
              var trackEl = el('span', 'music-track');
              trackEl.textContent = fmtTrack(track);
              block.appendChild(trackEl);
            }
            if (artist) {
              var dash2 = document.createTextNode(' · ');
              block.appendChild(dash2);
              var artistEl = el('span', 'music-artist');
              artistEl.textContent = artist;
              block.appendChild(artistEl);
            }
            if (url) {
              // Validate through safeLink so a malformed/javascript: URL stored
              // in music_url cannot execute when an agency viewer clicks.
              var safeMusicHref = safeLink(url);
              if (safeMusicHref) {
                var link = el('a', 'music-link');
                link.href   = safeMusicHref;
                link.target = '_blank';
                link.rel    = 'noopener noreferrer';
                link.textContent = '↗';
                block.appendChild(link);
              }
            }
            return block;
          }

          detail.appendChild(musicBlock('Brief', m.contracted_track, m.contracted_artist, m.contracted_url));

          var sep = el('span', 'music-sep');
          sep.textContent = '·';
          detail.appendChild(sep);

          detail.appendChild(musicBlock('Used', m.actual_track, m.actual_artist, m.actual_url));

          // No trailing "Different" marker. The row only exists on a deviation,
          // and the campaign headline chip plus the orange Sound cell directly
          // above already say so twice.
          musicTd.appendChild(detail);
          musicRow.appendChild(musicTd);
          tbody.appendChild(musicRow);
        }
      });
      table.appendChild(tbody);
      tableWrap.appendChild(table);
      return tableWrap;
  }

  /**
   * Render the campaigns panel as one collapsible list, a row per campaign.
   *
   * Each row leads with the sound (a music agency's mental handle on a deal),
   * carries its status/payment badges and headline views + ER, and expands to
   * the full deliverables table. Collapsed by default because an agency with
   * ~20 campaigns wants to scan the list, not scroll six screens of tables.
   *
   * @gotcha Layout forks on viewport at render time: <=768px swaps the desktop
   *         stats table for renderDeliverableMobileCard. The breakpoint is read
   *         once here and not re-evaluated on resize.
   * @perf Bodies are built on first expand, so a 19-campaign dashboard mounts
   *       19 rows instead of 19 tables plus their thumbnails.
   */
  function renderCampaigns(campaigns, container) {
    var isMobile = window.innerWidth <= 768;
    if (!campaigns || campaigns.length === 0) {
      var empty = el('div', 'empty-msg');
      empty.textContent = 'No campaigns found for this dashboard.';
      container.appendChild(empty);
      return;
    }

    // Global copy button - all posted URLs across all campaigns
    var allUrls = [];
    campaigns.forEach(function (c) {
      (c.deliverables || []).forEach(function (d) {
        if (d.post_url) allUrls.push(d.post_url);
      });
    });
    if (allUrls.length > 0) {
      var globalRow = el('div', 'copy-global-row');
      var globalBtn = makeCopyBtn(allUrls, 'Copy all ' + allUrls.length + ' post URL' + (allUrls.length === 1 ? '' : 's'));
      globalRow.appendChild(globalBtn);
      container.appendChild(globalRow);
    }

    var list = el('div', 'camp-list');

    // One column header for the whole list. Repeating it per campaign cost
    // ~35px x 19 campaigns of pure chrome in the previous card layout.
    // The leading empty cell holds the caret column so the header tracks the
    // same 5-column grid the rows use.
    var listHead = el('div', 'camp-listhead');
    ['', 'Campaign', 'Status', 'Views', 'ER%'].forEach(function (label, i) {
      var cell = el('span', i >= 3 ? 'camp-listhead-num' : '');
      cell.textContent = label;
      listHead.appendChild(cell);
    });
    list.appendChild(listHead);

    campaigns.forEach(function (campaign, cardIdx) {
      var delivs = campaign.deliverables || [];
      var item = el('div', 'camp-item');
      // Capped so the list finishes settling in ~0.4s however many campaigns
      // land; an uncapped per-row delay made the last row arrive 1.3s late.
      item.style.animationDelay = Math.min(cardIdx * 0.03, 0.4) + 's';

      var bodyId  = 'camp-body-' + cardIdx;
      var canOpen = delivs.length > 0;

      var row = el(canOpen ? 'button' : 'div', 'camp-row');
      if (canOpen) {
        row.type = 'button';
        row.setAttribute('aria-expanded', 'false');
        row.setAttribute('aria-controls', bodyId);
      }

      // Caret
      var caret = el('span', 'camp-caret');
      if (canOpen) caret.appendChild(icon('chevron', 13));
      row.appendChild(caret);

      // Identity: the sound headlines, dates and post count demote to the sub-line
      var label   = buildCampaignLabel(campaign);
      var idCell  = label.cell;
      var dateStr = label.dateStr;

      // Music compliance is a campaigns-tab concern, so the chip is appended by
      // this caller rather than baked into the shared label.
      if (label.sound) {
        var flag = campaignMusicFlag(delivs);
        if (flag) {
          var flagEl = el('span', flag === 'diff' ? 'music-diff' : 'camp-sound-pending');
          flagEl.textContent = flag === 'diff' ? '≠ Different' : 'Unverified';
          label.title.appendChild(flagEl);
        }
      }

      var subParts = [];
      if (label.sound && label.sound.artist) subParts.push(label.sound.artist);
      if (label.sound && dateStr)            subParts.push(dateStr);
      if (delivs.length > 0)                 subParts.push(delivs.length + ' post' + (delivs.length === 1 ? '' : 's'));
      else                                   subParts.push('No deliverables');
      label.setSub(subParts);
      row.appendChild(idCell);

      // Badges
      var badgesWrap = el('span', 'camp-badges');
      badgesWrap.appendChild(badge(campaign.status));
      if (campaign.payment) {
        var payStatus = campaign.payment.is_in_kind ? 'In-Kind' : (campaign.payment.status || 'Not-Invoiced');
        badgesWrap.appendChild(badge(payStatus));
      }
      row.appendChild(badgesWrap);

      // Headline metrics
      var totals = sumStats(delivs);
      var viewsEl = el('span', 'camp-metric');
      viewsEl.textContent = totals.hasStats ? fmtNum(totals.views) : '—';
      row.appendChild(viewsEl);
      // Orange is reserved for a real rate; an empty-value dash stays neutral.
      var erEl = el('span', 'camp-metric camp-metric-er' + (totals.avgER !== null ? '' : ' camp-metric-empty'));
      erEl.textContent = totals.avgER !== null ? totals.avgER.toFixed(1) + '%' : '—';
      row.appendChild(erEl);

      item.appendChild(row);

      if (canOpen) {
        var body = el('div', 'camp-body');
        body.id = bodyId;
        body.hidden = true;
        item.appendChild(body);

        var built = false;
        row.addEventListener('click', function () {
          if (!built) {
            built = true;
            if (!isMobile) {
              body.appendChild(buildDeliverablesTable(delivs, cardIdx));
            } else {
              var delivCardList = el('div', 'mobile-deliv-list');
              delivs.forEach(function (d) { delivCardList.appendChild(renderDeliverableMobileCard(d)); });
              body.appendChild(delivCardList);
            }

            // Foot band: totals (only where they add something the rows above
            // do not already state) on the left, copy-URLs on the right.
            var campUrls = delivs.filter(function (d) { return d.post_url; })
                                 .map(function (d) { return d.post_url; });
            var copyBtn  = makeCopyBtn(campUrls, null);
            var showTotals = totals.hasStats && delivs.length > 1;
            if (showTotals || copyBtn) {
              var foot = el('div', 'camp-foot');
              var pills = el('div', 'camp-foot-stats');
              if (showTotals) {
                [
                  { label: 'Total Views',     value: fmtNum(totals.views) },
                  { label: 'Total Likes',     value: fmtNum(totals.likes) },
                  { label: 'Total Comments',  value: fmtNum(totals.comments) },
                  { label: 'Total Shares',    value: fmtNum(totals.shares) },
                  { label: 'Engagement Rate', value: totals.avgER !== null ? totals.avgER.toFixed(1) + '%' : '—', highlight: true },
                ].forEach(function (m) {
                  var pill  = el('div', m.highlight ? 'stat-pill stat-pill-er' : 'stat-pill');
                  var valEl = el('div', 'stat-pill-value');
                  valEl.textContent = m.value;
                  var lblEl = el('div', 'stat-pill-label');
                  lblEl.textContent = m.label;
                  append(pill, valEl, lblEl);
                  pills.appendChild(pill);
                });
              }
              foot.appendChild(pills);
              if (copyBtn) foot.appendChild(copyBtn);
              body.appendChild(foot);
            }
          }
          var open = body.hidden;
          body.hidden = !open;
          row.setAttribute('aria-expanded', String(open));
          item.classList.toggle('camp-item--open', open);
        });
      }

      list.appendChild(item);
    });

    container.appendChild(list);
  }

  // ── Render: payment addresses ─────────────────────────────────────────────────

  /**
   * The Stripe row that heads the payment list.
   *
   * Deliberately carries NO link of its own. The payable thing is an invoice,
   * not the creator, so the actionable control is the per-campaign Pay now
   * button already rendered in the table below; a second entry point here would
   * be a link with no amount attached to it.
   *
   * @returns {HTMLElement} the row
   */
  function buildStripeRow() {
    var row = el('div', 'pay-addr-row pay-addr-row--preferred');

    var methodEl = el('span', 'pay-addr-method');
    methodEl.textContent = 'Stripe';

    var valueEl = el('div', 'pay-addr-value');
    var tag = el('span', 'pay-addr-tag');
    tag.textContent = 'Preferred';
    valueEl.appendChild(tag);
    var note = el('div', 'pay-addr-note');
    note.textContent = 'Use Pay now on any unpaid invoice below. Card or bank, and it clears straight away.';
    valueEl.appendChild(note);

    append(row, methodEl, valueEl);
    return row;
  }

  /** True when this method is PayPal, whatever the label says. @see rankMethods */
  function isPaypal(m) {
    return /paypal/i.test((m && (m.method || '')) + ' ' + (m && (m.label || '')));
  }

  /**
   * Order the ways an agency can pay us, most preferred first.
   *
   * @gotcha PayPal always sinks to the bottom, ignoring its `sort_order`. Being
   *   the last resort is a standing business rule rather than a per-creator
   *   preference, so it must not depend on a field somebody can set wrong when
   *   adding the next creator. Every other method keeps the server's order.
   * @param {Array} methods - one account's payment methods
   * @returns {Array} a new array; the input is not mutated
   */
  function rankMethods(methods) {
    var rest = [], paypal = [];
    (methods || []).forEach(function (m) { (isPaypal(m) ? paypal : rest).push(m); });
    return rest.concat(paypal);
  }

  /**
   * "Send Payment To": the ranked list of ways this agency can settle an invoice.
   *
   * Stripe leads because it reconciles itself, and it is the one method that is
   * NOT an address: it lives on the per-campaign Pay now buttons in the table
   * below, so this block points at them rather than repeating a link. That row
   * is suppressed when no unpaid invoice actually carries a link, since telling
   * an agency to use a button that is not on the page is worse than silence.
   *
   * @param {Array} paymentAddresses - accounts + methods from the edge function
   * @param {HTMLElement} container
   * @param {boolean} hasPayLinks - any unpaid campaign exposes a Stripe link
   */
  function renderPaymentAddresses(paymentAddresses, container, hasPayLinks) {
    if (!paymentAddresses || paymentAddresses.length === 0) return;

    var section = el('div', 'payment-addresses-section');

    var heading = el('div', 'payment-addresses-heading');
    heading.textContent = 'Send Payment To';
    section.appendChild(heading);

    var cards = el('div', 'payment-addresses-cards');
    // The platform header only earns its space when there is more than one
    // account to tell apart; with a single card it restates the dashboard.
    var showPlatform = paymentAddresses.length > 1;

    paymentAddresses.forEach(function (acct, acctIdx) {
      var card = el('div', 'payment-address-card');

      if (showPlatform) {
        var header     = el('div', 'pay-addr-header');
        var platformEl = el('span', 'pay-addr-platform');
        platformEl.textContent = acct.platform.charAt(0).toUpperCase() + acct.platform.slice(1);
        var usernameEl = el('span', 'pay-addr-username');
        usernameEl.textContent = '@' + acct.username;
        append(header, platformEl, usernameEl);
        card.appendChild(header);
      }

      // Stripe heads the first card only, so the recommendation is made once.
      if (hasPayLinks && acctIdx === 0) card.appendChild(buildStripeRow());

      rankMethods(acct.methods).forEach(function (m) {
        var row = el('div', 'pay-addr-row' + (isPaypal(m) ? ' pay-addr-row--last-resort' : ''));

        var methodEl = el('span', 'pay-addr-method');
        methodEl.textContent = m.label || m.method;

        var valueEl = el('div', 'pay-addr-value');
        var addr    = m.address || '';
        var href    = null;

        // Detect link type - all URLs go through safeLink(); mailto: only on valid email pattern
        if (/^https?:\/\//i.test(addr)) {
          href = safeLink(addr);
        } else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
          href = 'mailto:' + addr;
        }

        if (href) {
          var a = el('a', 'pay-addr-link');
          a.href = href;
          if (/^https?:/.test(href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
          a.textContent = addr;
          valueEl.appendChild(a);
          if (/^https?:/.test(href)) {
            var arrow = el('span', 'pay-addr-arrow');
            arrow.textContent = ' ↗';
            valueEl.appendChild(arrow);
          }
        } else {
          addr.split('\n').forEach(function (line, i) {
            if (i > 0) valueEl.appendChild(document.createElement('br'));
            valueEl.appendChild(document.createTextNode(line));
          });
        }

        append(row, methodEl, valueEl);
        card.appendChild(row);
      });

      cards.appendChild(card);
    });

    section.appendChild(cards);
    container.appendChild(section);
  }

  // ── Render: payments panel ─────────────────────────────────────────────────────

  /**
   * Render the payments panel: outstanding-amount hero, a Total/Paid/Outstanding
   * breakdown, where-to-send addresses, and a per-campaign payments table.
   * In-kind payments are excluded from every money total.
   *
   * @gotcha Bucketing keys off exact title-case status strings: 'Paid' is paid;
   *         'Pending' / 'Invoiced' / 'Overdue' are pending; anything else (incl.
   *         not-yet-invoiced) is notInvoiced. A casing drift in the payload
   *         would silently misbucket an amount. @see computeSummary.
   */
  /**
   * Build the Invoice cell for one payment row.
   *
   * The reference is the visible thing, not an icon: an agency quotes this
   * number in its own accounts-payable system, so it has to be readable and
   * copyable whether or not a PDF exists behind it.
   *
   * Three states, deliberately quiet: linked (a PDF is on file), plain muted
   * text (no PDF, but the reference still matters for their records), and an
   * em dash (no number at all, only possible on invoices predating automatic
   * numbering). No "unavailable" label. An absent affordance is the message.
   *
   * @returns the control alone, not a cell: desktop gives it its own column,
   *          mobile tucks it under the period. @see renderPayments
   */
  function invoiceControl(p) {
    if (!p.invoice_number) {
      var none = el('span', 'muted-cell');
      none.textContent = '—';
      return none;
    }

    if (!p.has_document) {
      var plain = el('span', 'muted-cell');
      plain.textContent = p.invoice_number;
      return plain;
    }

    // A button, not an anchor: there is no URL until the click mints one.
    var btn = el('button', 'invoice-link');
    btn.type = 'button';
    btn.title = 'Open invoice ' + p.invoice_number;
    var label = el('span');
    label.textContent = p.invoice_number;
    append(btn, icon('doc', 12, 'invoice-link-icon'), label);
    btn.addEventListener('click', function () { openInvoice(p.invoice_number, btn, label); });
    return btn;
  }

  /**
   * Exchange an invoice number for a short-lived URL, then go to the PDF.
   *
   * @security The page never holds a link to a stored file. The edge function
   *           re-validates this dashboard's token on every click and returns a
   *           URL that expires in 60 seconds, so revoking a shared link revokes
   *           document access immediately and nothing long-lived can be copied
   *           out of the page or a screenshot of it.
   * @security The new tab is opened blank and has its `opener` severed before
   *           it is ever navigated, so the invoice document can never reach
   *           back into this page through window.opener.
   * @gotcha The tab is opened SYNCHRONOUSLY, before the fetch, and pointed at
   *         the URL once it arrives. A window.open() issued after an await is
   *         swallowed by popup blockers, since it no longer counts as part of
   *         the click.
   * @gotcha Replacing the current tab instead would strand the reader: the hub
   *         previews this dashboard in a popup window with no back button.
   */
  function openInvoice(number, btn, label) {
    if (btn.disabled) return;

    var original = label.textContent;
    btn.disabled = true;

    // Must happen inside the click, not in the .then below.
    var tab = window.open('', '_blank');
    if (tab) tab.opener = null;

    var ac    = new AbortController();
    var timer = setTimeout(function () { ac.abort(); }, 12000);

    function failed() {
      clearTimeout(timer);
      if (tab) tab.close();   // never leave an orphaned blank tab behind
      btn.disabled = false;
      btn.classList.add('is-failed');
      label.textContent = 'Not available';
      setTimeout(function () {
        btn.classList.remove('is-failed');
        label.textContent = original;
      }, 3200);
    }

    fetch(EDGE + '?doc=' + encodeURIComponent(number), {
      method:  'GET',
      headers: { 'Accept': 'application/json', 'Authorization': 'Bearer ' + AUTH_TOKEN },
      signal:  ac.signal,
    })
      .then(function (res) {
        clearTimeout(timer);
        return res.ok ? res.json() : null;
      })
      .then(function (data) {
        var href = data && safeLink(data.url);
        if (!href) { failed(); return; }
        btn.disabled = false;
        if (tab) {
          tab.location.href = href;
        } else {
          // Popups blocked for this site. Showing the invoice still beats
          // refusing to; this page reloads cleanly from its own URL.
          window.location.href = href;
        }
      })
      .catch(function () { failed(); });
  }

  /**
   * Build the "Pay now" link for an outstanding invoice with an active Stripe
   * Payment Link, or null when there is nothing to pay.
   *
   * @param {object} p - the campaign's payment block.
   * @returns {?HTMLElement} an anchor opening Stripe in a new tab.
   * @security The URL is only ever present in the payload for a campaign the
   *           edge function has already confirmed is unpaid and not in-kind,
   *           so a settled invoice cannot show this control. safeLink is still
   *           applied here: every outbound href on this page goes through it.
   * @gotcha Opens in a NEW tab. Checkout must not replace the dashboard, which
   *         the hub previews inside a chrome-less popup with no back button.
   */
  function payNowControl(p) {
    var href = p && safeLink(p.pay_url);
    if (!href) return null;
    var a = el('a', 'pay-now-btn');
    a.href   = href;
    a.target = '_blank';
    a.rel    = 'noopener noreferrer';
    a.textContent = 'Pay now';
    a.appendChild(icon('arrow-out', 11, 'pay-now-icon'));
    return a;
  }

  function renderPayments(campaigns, container, paymentAddresses) {
    var withPayment = campaigns.filter(function (c) { return c.payment != null; });

    if (withPayment.length === 0) {
      renderPaymentAddresses(paymentAddresses, container, false);
      var empty = el('div', 'empty-msg');
      empty.textContent = 'No payment information available for these campaigns.';
      container.appendChild(empty);
      return;
    }

    // Compute totals
    var total = 0, paid = 0, pendingAmt = 0, notInvoiced = 0;
    withPayment.forEach(function (c) {
      var p = c.payment;
      if (p.is_in_kind) return;
      var amt = Number(p.amount) || 0;
      total += amt;
      var st = p.status || '';
      if (st === 'Paid')                                                   paid        += amt;
      else if (st === 'Pending' || st === 'Invoiced' || st === 'Overdue')  pendingAmt  += amt;
      else                                                                 notInvoiced += amt;
    });

    var outstanding = pendingAmt + notInvoiced;

    // Only recommend Stripe when a Pay now button is genuinely on this page. The
    // edge function withholds pay_url once an invoice is settled, so this goes
    // false by itself when everything is paid.
    var hasPayLinks = withPayment.some(function (c) { return !!(c.payment && c.payment.pay_url); });

    // ── Payment status hero - outstanding amount leads ──────────────────────────
    // All values set via textContent; style.color uses hardcoded CSS variable strings only
    var heroEl = el('div', 'payment-status-hero');

    var statusLbl = el('div', 'payment-status-label');
    statusLbl.textContent = outstanding > 0 ? 'Amount Outstanding' : 'Payment Status';
    heroEl.appendChild(statusLbl);

    var amountEl = el('div', 'payment-status-amount');
    if (outstanding > 0) {
      amountEl.className = 'payment-status-amount amount-outstanding';
      amountEl.textContent = fmtMoney(outstanding);
    } else if (paid > 0) {
      amountEl.className = 'payment-status-amount amount-clear';
      amountEl.textContent = 'Paid in Full';
    } else {
      amountEl.textContent = '—';
    }
    heroEl.appendChild(amountEl);

    // Secondary breakdown: Total | Paid | Pending/Outstanding
    var breakdownEl = el('div', 'payment-breakdown');
    var breakdownItems = [
      {
        label: 'Total Contracted',
        value: fmtMoney(total),
        color: null,
      },
      {
        label: 'Paid',
        value: fmtMoney(paid),
        color: paid > 0 ? 'var(--green)' : null,
      },
      {
        label: outstanding > 0 ? 'Still Outstanding' : 'Remaining',
        value: fmtMoney(outstanding),
        color: outstanding > 0 ? 'var(--orange2)' : null,
      },
    ];
    breakdownItems.forEach(function (item) {
      var cell  = el('div', 'payment-breakdown-cell');
      var valEl = el('div', 'payment-breakdown-value');
      valEl.textContent = item.value;
      if (item.color) valEl.style.color = item.color;
      var lblEl = el('div', 'payment-breakdown-label');
      lblEl.textContent = item.label;
      append(cell, valEl, lblEl);
      breakdownEl.appendChild(cell);
    });
    heroEl.appendChild(breakdownEl);
    container.appendChild(heroEl);

    // Payment addresses (where to send it)
    renderPaymentAddresses(paymentAddresses, container, hasPayLinks);

    // Per-campaign payments table
    var wrap      = el('div', 'payments-section');
    var tableWrap = el('div', 'table-wrap');
    var table     = el('table');

    /* The invoice reference gets its own trailing column on desktop, but on a
     * phone a fifth column lands two swipes into the horizontal scroll, which
     * hides the one control on this table. There it moves under the period
     * instead, where it is visible without scrolling at all. */
    var isMobile = window.innerWidth <= 768;

    var thead = el('thead');
    var hr    = el('tr');
    (isMobile ? ['Campaign', 'Status', 'Amount', 'Date']
              : ['Campaign', 'Status', 'Amount', 'Date', 'Invoice']).forEach(function (c) {
      var th = el('th');
      th.textContent = c;
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    var tbody = el('tbody');
    withPayment.forEach(function (c) {
      var p   = c.payment;
      var row = el('tr');

      // Same identity as the campaigns tab: the sound names the row, the dates
      // demote to the metadata line. @see buildCampaignLabel
      var campTd = el('td', 'pay-camp-cell');
      var label  = buildCampaignLabel(c);
      label.setSub([label.dateStr || '—']);
      campTd.appendChild(label.cell);
      if (isMobile) {
        var sub = el('div', 'sub-note invoice-sub');
        sub.appendChild(invoiceControl(p));
        campTd.appendChild(sub);
      }
      row.appendChild(campTd);

      var statusTd = el('td');
      statusTd.appendChild(badge(p.status));
      var payBtn = payNowControl(p);
      if (payBtn) statusTd.appendChild(payBtn);
      row.appendChild(statusTd);

      var amountTd = el('td');
      if (p.is_in_kind) {
        amountTd.textContent = 'In Kind';
        if (p.in_kind_description) amountTd.title = p.in_kind_description;
      } else {
        amountTd.textContent = fmtMoney(p.amount);
      }
      row.appendChild(amountTd);

      var dateTd = el('td', 'muted-cell');
      dateTd.textContent = fmtDate(p.paid_date || p.invoice_date);
      row.appendChild(dateTd);

      if (!isMobile) {
        var invTd = el('td', 'invoice-cell');
        invTd.appendChild(invoiceControl(p));
        row.appendChild(invTd);
      }

      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    tableWrap.appendChild(table);
    wrap.appendChild(tableWrap);
    container.appendChild(wrap);
  }

  // ── Render: full dashboard ─────────────────────────────────────────────────────

  function renderExpiryBanner(expiresAt) {
    var msLeft = new Date(expiresAt) - new Date();
    if (msLeft <= 0) return; // already expired — full error state handles it

    var sevenDays = 7 * 24 * 60 * 60 * 1000;
    if (msLeft >= sevenDays) return; // more than 7 days — no banner

    var isUrgent = msLeft < 24 * 60 * 60 * 1000;
    var banner = el('div', 'expiry-banner' + (isUrgent ? ' expiry-banner--urgent' : ''));
    var inner  = el('div', 'container expiry-banner-inner');
    var text   = el('span', 'expiry-banner-text');

    if (isUrgent) {
      text.textContent = 'This link expires today';
    } else {
      var daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
      text.textContent = 'This link expires ' + fmtDate(expiresAt.split('T')[0]) + ' — ' + daysLeft + ' days remaining';
    }

    append(inner, text);
    banner.appendChild(inner);
    document.querySelector('.agency-header').insertAdjacentElement('afterend', banner);
  }

  /**
   * Render the closing call-to-action band, inserted just before the footer.
   * A sales surface should end on a next step, not trail off into a table.
   * Generic by design - there is no per-agency contact channel in the payload,
   * so it points back to the Nysterys contact + nysterys.com.
   */
  // ── Rates ──────────────────────────────────────────────────────────────────

  /**
   * Render the Rates tab: a plain price list.
   *
   * Each package is one line: what it is, which platforms it covers, and what
   * it costs. Nothing is computed here and nothing is interactive. An earlier
   * version made the agency toggle platforms while prices re-summed, which made
   * a price list into a configurator and read as a quote engine rather than a
   * rate card. A bundle is simply its own line.
   *
   * @param {object} rateCard - payload.rate_card
   * @param {HTMLElement} container
   */
  function renderRates(rateCard, container) {
    container.innerHTML = '';
    if (!rateCard || !(rateCard.packages || []).length) return;

    var wrap = el('div', 'rates-section');
    var list = el('div', 'rates-list');

    rateCard.packages.forEach(function (pkg) {
      var row = el('div', 'rate-row');

      var main = el('div', 'rate-row-main');
      var nm = el('div', 'rate-name');
      nm.textContent = pkg.name;
      main.appendChild(nm);

      var bits = [];
      if (pkg.quantity > 1) bits.push(pkg.quantity + ' posts');
      if ((pkg.platforms || []).length) bits.push(pkg.platforms.join(' + '));
      if (pkg.description) bits.push(pkg.description);
      if (bits.length) {
        var meta = el('div', 'rate-meta');
        meta.textContent = bits.join(' \u00b7 ');
        main.appendChild(meta);
      }
      row.appendChild(main);

      var amt = el('div', 'rate-amount');
      amt.textContent = fmtMoney(pkg.price);
      row.appendChild(amt);

      list.appendChild(row);
    });

    wrap.appendChild(list);

    if ((rateCard.addons || []).length) {
      var addWrap = el('div', 'rates-addons');
      var addLbl = el('div', 'section-label');
      addLbl.textContent = 'Add-ons';
      addWrap.appendChild(addLbl);
      rateCard.addons.forEach(function (a) {
        var r = el('div', 'rate-addon');
        var l = el('div', 'rate-addon-main');
        var n = el('div', 'rate-addon-name');
        n.textContent = a.name;
        l.appendChild(n);
        if (a.description) {
          var d = el('div', 'rate-addon-desc');
          d.textContent = a.description;
          l.appendChild(d);
        }
        var p = el('div', 'rate-addon-price');
        // A null price means "priced on request", never $0.
        p.textContent = a.price === null ? 'On request' : fmtMoney(a.price);
        r.appendChild(l);
        r.appendChild(p);
        addWrap.appendChild(r);
      });
      wrap.appendChild(addWrap);
    }

    if (rateCard.notes) {
      var note = el('p', 'rates-note');
      note.textContent = rateCard.notes;
      wrap.appendChild(note);
    }

    container.appendChild(wrap);
  }

  function renderClosingCta(dash) {
    var first = (dash.creator_name || '').split(' ')[0];
    var cta   = el('div', 'closing-cta');
    var inner = el('div', 'container closing-cta-inner');

    var textWrap = el('div', 'closing-cta-text');
    var kicker = el('div', 'closing-cta-kicker');
    kicker.textContent = "What's next";
    var title = el('h2', 'closing-cta-title');
    title.textContent = first ? ('Ready for ' + first + "'s next campaign?") : 'Ready for the next campaign?';
    var body = el('p', 'closing-cta-body');
    body.textContent = 'Reply to your Nysterys contact to lock dates.';
    append(textWrap, kicker, title, body);

    var link = el('a', 'closing-cta-link');
    link.href = 'https://nysterys.com';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Visit nysterys.com ↗';

    append(inner, textWrap, link);
    cta.appendChild(inner);

    var footer = document.querySelector('.agency-footer');
    if (footer) footer.parentNode.insertBefore(cta, footer);
  }

  /**
   * Top-level render once the payload arrives: hides loading, draws the expiry
   * banner / hero / KPI strip, then dispatches on dash.scope to show the
   * campaigns panel, the payments panel, or both behind a tab switcher.
   *
   * @param {object} data - { dashboard, campaigns } from the edge function.
   */
  /**
   * Show the enabled panels and, when there is more than one, wire a real ARIA
   * tablist over them.
   *
   * @param {HTMLElement} tabsEl - the nav that holds the tab buttons
   * @param {Array<{tab:HTMLElement, panel:HTMLElement}>} panels - enabled, in order
   *
   * @gotcha With exactly one panel the tab bar stays hidden. A lone tab is not a
   *         choice, and a brand-new agency with rates only would otherwise see a
   *         one-item tablist that looks like something failed to load.
   * @gotcha Roving tabindex: only the selected tab is in the tab order, which is
   *         what lets a keyboard user arrow between tabs rather than tabbing
   *         through every one of them.
   */
  function activatePanels(tabsEl, panels) {
    if (!panels.length) return;

    if (panels.length === 1) {
      panels[0].panel.removeAttribute('hidden');
      return;
    }

    tabsEl.removeAttribute('hidden');
    tabsEl.setAttribute('role', 'tablist');

    panels.forEach(function (p) {
      p.tab.removeAttribute('hidden');
      p.tab.setAttribute('role', 'tab');
      p.panel.setAttribute('role', 'tabpanel');
      p.panel.setAttribute('aria-labelledby', p.tab.id);
    });

    function select(index) {
      panels.forEach(function (p, i) {
        var on = i === index;
        p.tab.classList.toggle('tab-active', on);
        p.tab.setAttribute('aria-selected', on ? 'true' : 'false');
        if (on) p.tab.removeAttribute('tabindex');
        else    p.tab.setAttribute('tabindex', '-1');
        if (on) p.panel.removeAttribute('hidden');
        else    p.panel.hidden = true;
      });
    }

    panels.forEach(function (p, i) {
      p.tab.addEventListener('click', function () { select(i); });
    });

    tabsEl.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      var cur = panels.findIndex(function (p) { return p.tab === document.activeElement; });
      if (cur === -1) return;
      var next = e.key === 'ArrowRight'
        ? (cur + 1) % panels.length
        : (cur - 1 + panels.length) % panels.length;
      select(next);
      panels[next].tab.focus();
    });

    select(0);
  }

  function renderDashboard(data) {
    var dash      = data.dashboard;
    var campaigns = data.campaigns || [];
    var scope     = dash.scope;
    var summary   = computeSummary(campaigns);

    document.getElementById('loading-state').hidden = true;

    if (dash.expires_at) renderExpiryBanner(dash.expires_at);
    renderCreatorHero(dash);
    renderKpiStrip(campaigns, summary, dash);

    var tabsEl    = document.getElementById('tabs');
    var campPanel = document.getElementById('campaigns-panel');
    var payPanel  = document.getElementById('payments-panel');
    var dashboard = document.getElementById('dashboard');
    var payAddrs  = dash.payment_addresses || [];

    dashboard.removeAttribute('hidden');

    /* Panels are declared, then the tab bar is built from whichever are on.
     * This replaced a hardcoded two-tab switcher driven by the `scope` enum:
     * scope encodes COMBINATIONS, so a third panel would have taken it from 3
     * values to 7 and a fourth to 15. Rates is a separate boolean for exactly
     * that reason, and a brand-new agency can run rates-only with no campaigns
     * behind it. @see shared_dashboards.show_rates */
    var ratesPanel = document.getElementById('rates-panel');
    var panels = [];

    /* @gotcha Test scope POSITIVELY. Written as "scope !== 'payments_only'" and
     * "scope !== 'campaigns_only'", a rates_only prospect link satisfies BOTH
     * and renders empty Campaigns and Payments tabs to someone we have not even
     * signed yet. */
    var wantsCampaigns = scope === 'campaigns_only' || scope === 'campaigns_and_payments';
    var wantsPayments  = scope === 'payments_only'  || scope === 'campaigns_and_payments';

    if (wantsCampaigns) {
      // Performance chart sits above the tabs, so it is gated on the same
      // positive test rather than a "not payments_only" that a rates_only link
      // would sail straight through.
      renderPerfChart(campaigns);
      renderCampaigns(campaigns, campPanel);
      panels.push({ tab: document.getElementById('tab-campaigns'), panel: campPanel });
    }
    if (wantsPayments) {
      renderPayments(campaigns, payPanel, payAddrs);
      panels.push({ tab: document.getElementById('tab-payments'), panel: payPanel });
    }
    if (dash.show_rates && data.rate_card) {
      renderRates(data.rate_card, ratesPanel);
      panels.push({ tab: document.getElementById('tab-rates'), panel: ratesPanel });
    }

    activatePanels(tabsEl, panels);

    // Close every scope on a next-step CTA rather than trailing off.
    renderClosingCta(dash);
  }

  // ── Entry point ────────────────────────────────────────────────────────────────

  /**
   * Entry point (on DOMContentLoaded): extract the token, fetch the dashboard,
   * and route HTTP outcomes to showError or renderDashboard. 12s abort timeout.
   *
   * @security The token is read from the URL fragment (#t=...) and sent ONLY as
   *           an Authorization: Bearer header, so it never lands in the request
   *           line, server access logs, or Referer. A legacy ?t=/?token= query
   *           param is migrated to the hash via replaceState before use, so old
   *           shared links stop leaking the token going forward.
   */
  function init() {
    // Token lives in the URL fragment (#t=...) so it is never sent to any
    // server in access logs or Referer headers. Fall back to query param for
    // backwards compatibility with previously shared links (?t=...).
    //
    // If the token arrived as a query param (?t=... or ?token=...), migrate it
    // to the hash immediately so it never appears in server access logs or
    // Referer headers going forward. replaceState removes it from browser
    // history as well.
    var queryParams = new URLSearchParams(window.location.search);
    var queryToken  = queryParams.get('t') || queryParams.get('token') || '';
    if (queryToken) {
      window.history.replaceState(null, '', window.location.pathname);
      window.location.hash = 't=' + encodeURIComponent(queryToken);
      // Fall through - hash is now set, extraction below will find it.
    }

    var hash  = new URLSearchParams(window.location.hash.slice(1)).get('t') || '';
    var token = hash;

    if (!token) {
      showError('no-token');
      return;
    }

    AUTH_TOKEN = token;

    var ac    = new AbortController();
    var timer = setTimeout(function () { ac.abort(); }, 12000);

    fetch(EDGE, {
      method:  'GET',
      headers: { 'Accept': 'application/json', 'Authorization': 'Bearer ' + token },
      signal:  ac.signal,
    })
      .then(function (res) {
        clearTimeout(timer);
        if (res.status === 403) {
          return res.json().catch(function () { return null; }).then(function (body) {
            showError('expired', body && body.expires_at ? body.expires_at : null);
            return null;
          });
        }
        if (res.status === 404) { showError('not-found'); return null; }
        if (!res.ok)            { showError('server-error'); return null; }
        return res.json();
      })
      .then(function (data) {
        if (!data) return;
        renderDashboard(data);
      })
      .catch(function (err) {
        clearTimeout(timer);
        showError(err && err.name === 'AbortError' ? 'timeout' : 'network');
      });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
