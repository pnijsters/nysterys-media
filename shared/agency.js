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
    chevron: [ { t: 'path', a: { d: 'M6 4l4 4-4 4' } } ], // points right; rotate 90deg when open
    ban:   [
      { t: 'circle', a: { cx: '8', cy: '8', r: '5.5' } },
      { t: 'path',   a: { d: 'M4.1 4.1l7.8 7.8' } },
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

  function normTrack(t) {
    return t ? t.toLowerCase().replace(/-/g, ' ').trim() : '';
  }

  function musicUrlMatch(contractedUrl, contractedId, actualUrl, actualId) {
    if (!contractedUrl || !actualUrl) return false;
    if (contractedId && actualId) return contractedId === actualId;
    return contractedUrl === actualUrl;
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

    // Sound compliance - music agencies only
    var agencyType = dash && dash.agency_type ? dash.agency_type : '';
    if (agencyType.toLowerCase().indexOf('music') !== -1) {
      var scConfirmed = 0, scMismatched = 0, scTotal = 0;
      campaigns.forEach(function (c) {
        (c.deliverables || []).forEach(function (d) {
          var mu = d.music;
          if (!mu || (!mu.contracted_url && !mu.contracted_track)) return;
          scTotal++;
          var hasActual  = !!(mu.actual_url || mu.actual_track);
          var urlMatch   = musicUrlMatch(mu.contracted_url, mu.contracted_music_id, mu.actual_url, mu.actual_music_id);
          var trackMatch = mu.contracted_track && mu.actual_track &&
            normTrack(mu.contracted_track) === normTrack(mu.actual_track);
          if (hasActual && (urlMatch || trackMatch)) scConfirmed++;
          else if (hasActual) scMismatched++;
        });
      });
      if (scTotal > 0) {
        var scVal, scColor;
        if (scMismatched > 0) {
          scVal   = scMismatched + (scMismatched === 1 ? ' Mismatch' : ' Mismatches');
          scColor = 'var(--orange2)';
        } else if (scConfirmed === scTotal) {
          scVal   = 'All Confirmed';
          scColor = 'var(--green)';
        } else {
          scVal   = scConfirmed + '/' + scTotal + ' Confirmed';
          scColor = null;
        }
        items.push({ val: scVal, label: 'Music Compliance', color: scColor, tip: 'Whether the audio used matches the contracted track.' });
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

    var section = document.getElementById('perf-chart-section');
    buildChartRows(document.getElementById('perf-chart-bars'), avgItems, avgItems[0].views, 120);
    section.removeAttribute('hidden');

    // ── Chart 2: top individual posts ──
    var allPosts = [];
    campaigns.forEach(function (c) {
      var parts  = (c.name || '').split('-');
      var agency = parts.length >= 4 ? parts.slice(3).join('-') : (c.name || '');

      c.deliverables.forEach(function (d) {
        if (d.stats && d.stats.views > 0) {
          allPosts.push({
            label: fmtDateShort(d.posted_date || d.due_date),
            title: c.name || '',
            views: d.stats.views,
            value: fmtNum(d.stats.views) + ' views',
            sub:   agency,
          });
        }
      });
    });

    if (allPosts.length === 0) return;
    allPosts.sort(function (a, b) { return b.views - a.views; });
    var topPosts = allPosts.slice(0, 8);

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

  // ── Sound Check DOM builders (shared by desktop cells and mobile merged cell) ──

  function buildCaptionContent(item, container) {
    if (item.caption) {
      var raw = item.caption.trim();
      var stripped = raw.replace(/#\S+/g, '').replace(/\s+/g, ' ').trim();
      var display = stripped.length > 90 ? stripped.slice(0, 90) + '…' : stripped;
      var capEl = el('span', 'sc-caption');
      capEl.textContent = display || raw.slice(0, 90);
      container.appendChild(capEl);
      var safePost = item.post_url ? safeLink(item.post_url) : null;
      if (safePost) {
        var lnk = el('a', 'sc-link');
        lnk.href = safePost;
        lnk.target = '_blank';
        lnk.rel = 'noopener noreferrer';
        lnk.textContent = ' ↗';
        container.appendChild(lnk);
      }
    } else {
      container.textContent = '—';
    }
  }

  function buildTrackContent(item, container) {
    if (item.track) {
      var trackEl = el('span', 'sc-track');
      trackEl.textContent = fmtTrack(item.track);
      container.appendChild(trackEl);
      if (item.artist) {
        container.appendChild(document.createTextNode(' — '));
        var artistEl = el('span', 'sc-artist');
        artistEl.textContent = item.artist;
        container.appendChild(artistEl);
      }
      var musicHref = item.url ? safeLink(item.url) : null;
      if (musicHref) {
        var lnk = el('a', 'sc-link');
        lnk.href = musicHref;
        lnk.target = '_blank';
        lnk.rel = 'noopener noreferrer';
        lnk.textContent = ' ↗';
        container.appendChild(lnk);
      }
    } else {
      container.textContent = '—';
    }
  }

  // ── Render: music compliance strip (music-promo agencies only) ────────────────

  /**
   * Render the Sound Check table comparing contracted vs actual audio per post.
   * No-op unless agencyType contains 'music' (case-insensitive) and at least
   * one deliverable carries a music brief.
   *
   * @gotcha A row counts as a match on either a music-id/URL match (musicUrlMatch)
   *         OR a normalized track-name match (normTrack); status is 'pending'
   *         until the actual audio data arrives.
   */
  function renderSoundCheck(campaigns, agencyType, container) {
    if (!agencyType || agencyType.toLowerCase().indexOf('music') === -1) return;

    var groups = [];
    campaigns.forEach(function(c) {
      var items = [];
      (c.deliverables || []).forEach(function(d) {
        var mu = d.music;
        if (!mu || (!mu.contracted_url && !mu.contracted_track)) return;
        var hasActual = !!(mu.actual_url || mu.actual_track);
        var urlMatch   = musicUrlMatch(mu.contracted_url, mu.contracted_music_id, mu.actual_url, mu.actual_music_id);
        var trackMatch = mu.contracted_track && mu.actual_track &&
          normTrack(mu.contracted_track) === normTrack(mu.actual_track);
        var matched = urlMatch || trackMatch;
        items.push({
          thumb:       d.cover_image_url || null,
          post_url:    d.post_url || null,
          posted_date: d.posted_date || null,
          caption:     d.caption || null,
          track:       mu.contracted_track || null,
          artist:      mu.contracted_artist || null,
          url:         mu.contracted_url || null,
          status:      !hasActual ? 'pending' : matched ? 'match' : 'diff',
        });
      });
      if (items.length > 0) groups.push({ campaign: c, items: items });
    });

    if (groups.length === 0) return;

    var multiCampaign = groups.length > 1;

    var wrap = el('div', 'sound-check');

    var hdr = el('div', 'sound-check-hdr');
    var hdrIcon = icon('music', 22, 'sc-icon');
    var lbl = el('span', 'sc-hdr-label');
    lbl.textContent = 'Sound Check';
    append(hdr, hdrIcon, lbl);
    wrap.appendChild(hdr);

    var table = el('table', 'sc-table');
    var tbody = el('tbody');

    groups.forEach(function(group) {
      if (multiCampaign) {
        var campRow = el('tr', 'sc-campaign-row');
        var campTd  = el('td', 'sc-campaign-cell');
        campTd.colSpan = 5;
        var startStr = fmtDate(group.campaign.start_date);
        var endStr   = fmtDate(group.campaign.end_date);
        campTd.textContent = (startStr !== '—' || endStr !== '—') ? startStr + ' – ' + endStr : (group.campaign.name || '');
        campRow.appendChild(campTd);
        tbody.appendChild(campRow);
      }

      group.items.forEach(function(item) {
        var row = el('tr', 'sc-row');

      // Column 1: thumbnail + post date
      var thumbTd = el('td', 'sc-thumb-cell');
      var thumbInner = el('div', 'sc-thumb-inner');
      var safeThumb = item.thumb ? safeLink(item.thumb) : null;
      var safePostHref = item.post_url ? safeLink(item.post_url) : null;
      if (safeThumb) {
        var img = document.createElement('img');
        img.className = 'sc-thumb';
        img.src = safeThumb;
        img.alt = '';
        if (safePostHref) {
          var thumbLink = el('a', 'sc-thumb-link');
          thumbLink.href = safePostHref;
          thumbLink.target = '_blank';
          thumbLink.rel = 'noopener noreferrer';
          thumbLink.appendChild(img);
          thumbInner.appendChild(thumbLink);
        } else {
          thumbInner.appendChild(img);
        }
      } else {
        var placeholder = el('div', 'sc-thumb sc-thumb-empty');
        thumbInner.appendChild(placeholder);
      }
      var dateEl = el('div', 'sc-date');
      dateEl.textContent = fmtDateShort(item.posted_date) || '—';
      thumbInner.appendChild(dateEl);
      thumbTd.appendChild(thumbInner);
      row.appendChild(thumbTd);

      // Column 2: caption (desktop only - hidden on mobile via CSS)
      var captionTd = el('td', 'sc-caption-cell');
      buildCaptionContent(item, captionTd);
      row.appendChild(captionTd);

      // Column 3: contracted track (desktop only - hidden on mobile via CSS)
      var trackTd = el('td', 'sc-track-cell');
      buildTrackContent(item, trackTd);
      row.appendChild(trackTd);

      // Column 4: caption + track stacked (mobile only - hidden on desktop via CSS)
      var contentTd = el('td', 'sc-content-cell');
      var capDiv = el('div', 'sc-content-caption');
      buildCaptionContent(item, capDiv);
      contentTd.appendChild(capDiv);
      var trackDiv = el('div', 'sc-content-track');
      buildTrackContent(item, trackDiv);
      contentTd.appendChild(trackDiv);
      row.appendChild(contentTd);

      // Column 5: status
      var statusTd = el('td', 'sc-status sc-' + item.status);
      statusTd.textContent = item.status === 'match' ? '✓ Confirmed' : item.status === 'diff' ? '≠ Different' : 'Pending';
      row.appendChild(statusTd);

        tbody.appendChild(row);
      });
    });

    table.appendChild(tbody);
    wrap.appendChild(table);
    container.appendChild(wrap);
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
      var urlMatch   = hasBrief && hasActual && musicUrlMatch(m.contracted_url, m.contracted_music_id, m.actual_url, m.actual_music_id);
      var trackMatch = hasBrief && hasActual && m.contracted_track && m.actual_track &&
        normTrack(m.contracted_track) === normTrack(m.actual_track);
      var isMatch = urlMatch || trackMatch;

      var musicRow = el('div', 'mobile-deliv-music');
      musicRow.appendChild(icon('music', 12, 'mobile-deliv-music-note'));

      if (hasBrief && m.contracted_track) {
        var trackEl = el('span', 'mobile-deliv-music-track');
        trackEl.textContent = fmtTrack(m.contracted_track) + (m.contracted_artist ? ' — ' + m.contracted_artist : '');
        musicRow.appendChild(trackEl);
      }

      var scEl = el('span', isMatch ? 'music-match' : (hasActual ? 'music-diff' : 'mobile-deliv-music-pending'));
      scEl.textContent = !hasActual ? 'Pending' : (isMatch ? '✓ Confirmed' : '≠ Different');
      musicRow.appendChild(scEl);

      card.appendChild(musicRow);
    }

    return card;
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
   * Render the campaigns panel: a global copy-all-URLs button, then one card
   * per campaign (header badges, deliverables, aggregate stats bar).
   *
   * @gotcha Layout forks on viewport at render time: <=768px swaps the desktop
   *         stats table for renderDeliverableMobileCard. The breakpoint is read
   *         once here and not re-evaluated on resize.
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

    campaigns.forEach(function (campaign, cardIdx) {
      var card = el('div', 'campaign-card');
      card.style.animationDelay = (cardIdx * 0.07) + 's';

      // Card header
      var head      = el('div', 'campaign-head');
      var nameGroup = el('div', 'campaign-name-group');
      var datesEl = el('div', 'campaign-name');
      var startStr = fmtDate(campaign.start_date);
      var endStr   = fmtDate(campaign.end_date);
      datesEl.textContent = (startStr !== '—' || endStr !== '—') ? startStr + ' – ' + endStr : '';
      nameGroup.appendChild(datesEl);

      var badgesWrap = el('div', 'campaign-badges');
      badgesWrap.appendChild(badge(campaign.status));
      if (campaign.payment) {
        var payStatus = campaign.payment.is_in_kind ? 'In-Kind' : (campaign.payment.status || 'Not-Invoiced');
        badgesWrap.appendChild(badge(payStatus));
      }
      // Per-campaign copy button
      var campUrls = (campaign.deliverables || []).filter(function (d) { return d.post_url; }).map(function (d) { return d.post_url; });
      var campCopyBtn = makeCopyBtn(campUrls, null);
      if (campCopyBtn) badgesWrap.appendChild(campCopyBtn);
      append(head, nameGroup, badgesWrap);
      card.appendChild(head);

      var delivs = campaign.deliverables || [];

      if (delivs.length === 0) {
        var noDeliv = el('div', 'no-deliverables');
        noDeliv.textContent = 'No deliverables for this campaign.';
        card.appendChild(noDeliv);
        container.appendChild(card);
        return;
      }

      var sectionLabel = el('div', 'section-label');
      sectionLabel.textContent = 'Deliverables';
      card.appendChild(sectionLabel);

      if (!isMobile) {
      // Desktop: full stats table
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
      var cols  = ['Platform', 'Status', 'Due', 'Views', 'Completion', 'ER%'];
      var colTips = {
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
          engTd.colSpan = 8; // thumb + 6 core columns + caret
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

        // Music sub-row - only when there's a mismatch or unverified brief (not yet posted)
        var m = d.music;
        var hasBrief  = m && (m.contracted_url || m.contracted_track);
        var hasActual = m && (m.actual_url     || m.actual_track);
        var urlMatch   = hasBrief && hasActual && musicUrlMatch(m.contracted_url, m.contracted_music_id, m.actual_url, m.actual_music_id);
        var trackMatch = hasBrief && hasActual && m.contracted_track && m.actual_track &&
          m.contracted_track.toLowerCase().replace(/-/g, ' ').trim() === m.actual_track.toLowerCase().replace(/-/g, ' ').trim();
        var isMatch = urlMatch || trackMatch;
        // Show when: brief exists but not yet verified (no actual data), or there's a confirmed mismatch
        if ((hasBrief || hasActual) && !(hasBrief && hasActual && isMatch)) {
          var musicRow = el('tr', 'music-row');
          var musicTd  = el('td');
          musicTd.colSpan = 8; // thumb + 6 core columns + caret

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

          if (hasBrief) {
            detail.appendChild(musicBlock('Brief', m.contracted_track, m.contracted_artist, m.contracted_url));
          }

          if (hasBrief && hasActual) {
            var sep = el('span', 'music-sep');
            sep.textContent = '·';
            detail.appendChild(sep);
          }

          if (hasActual) {
            detail.appendChild(musicBlock('Used', m.actual_track, m.actual_artist, m.actual_url));
          }

          if (hasBrief && hasActual) {
            // Always a mismatch at this point (matches are filtered out above)
            var indicator = el('span', 'music-diff');
            indicator.textContent = '≠ Different';
            detail.appendChild(indicator);
          }

          musicTd.appendChild(detail);
          musicRow.appendChild(musicTd);
          tbody.appendChild(musicRow);
        }
      });
      table.appendChild(tbody);
      tableWrap.appendChild(table);
      card.appendChild(tableWrap);
      } else {
        // Mobile: compact card list
        var delivCardList = el('div', 'mobile-deliv-list');
        delivs.forEach(function (d) { delivCardList.appendChild(renderDeliverableMobileCard(d)); });
        card.appendChild(delivCardList);
      }

      // Aggregate stats bar
      var totals = sumStats(delivs);
      if (totals.hasStats) {
        var statsRow = el('div', 'campaign-stats-row');
        var metrics  = [
          { label: 'Total Views',    value: fmtNum(totals.views) },
          { label: 'Total Likes',    value: fmtNum(totals.likes) },
          { label: 'Total Comments', value: fmtNum(totals.comments) },
          { label: 'Total Shares',   value: fmtNum(totals.shares) },
          { label: 'Engagement Rate', value: totals.avgER !== null ? totals.avgER.toFixed(1) + '%' : '—', highlight: true },
        ];
        metrics.forEach(function (m) {
          var pill  = el('div', m.highlight ? 'stat-pill stat-pill-er' : 'stat-pill');
          var valEl = el('div', 'stat-pill-value');
          valEl.textContent = m.value;
          var lblEl = el('div', 'stat-pill-label');
          lblEl.textContent = m.label;
          append(pill, valEl, lblEl);
          statsRow.appendChild(pill);
        });
        card.appendChild(statsRow);
      }

      container.appendChild(card);
    });
  }

  // ── Render: payment addresses ─────────────────────────────────────────────────

  function renderPaymentAddresses(paymentAddresses, container) {
    if (!paymentAddresses || paymentAddresses.length === 0) return;

    var section = el('div', 'payment-addresses-section');

    var heading = el('div', 'payment-addresses-heading');
    heading.textContent = 'Send Payment To';
    section.appendChild(heading);

    var cards = el('div', 'payment-addresses-cards');

    paymentAddresses.forEach(function (acct) {
      var card = el('div', 'payment-address-card');

      var header     = el('div', 'pay-addr-header');
      var platformEl = el('span', 'pay-addr-platform');
      platformEl.textContent = acct.platform.charAt(0).toUpperCase() + acct.platform.slice(1);
      var usernameEl = el('span', 'pay-addr-username');
      usernameEl.textContent = '@' + acct.username;
      append(header, platformEl, usernameEl);
      card.appendChild(header);

      acct.methods.forEach(function (m) {
        var row = el('div', 'pay-addr-row');

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
  function renderPayments(campaigns, container, paymentAddresses) {
    var withPayment = campaigns.filter(function (c) { return c.payment != null; });

    if (withPayment.length === 0) {
      renderPaymentAddresses(paymentAddresses, container);
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
    renderPaymentAddresses(paymentAddresses, container);

    // Per-campaign payments table
    var wrap      = el('div', 'payments-section');
    var tableWrap = el('div', 'table-wrap');
    var table     = el('table');

    var thead = el('thead');
    var hr    = el('tr');
    ['Period', 'Status', 'Amount', 'Date'].forEach(function (c) {
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

      var periodTd = el('td');
      var startStr = fmtDate(c.start_date);
      var endStr   = fmtDate(c.end_date);
      periodTd.textContent = (startStr !== '—' || endStr !== '—') ? startStr + ' – ' + endStr : '—';
      row.appendChild(periodTd);

      var statusTd = el('td');
      statusTd.appendChild(badge(p.status));
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

    // Performance chart - only when there are campaigns with stats
    if (scope !== 'payments_only') {
      renderPerfChart(campaigns);
    }

    if (scope === 'campaigns_only') {
      campPanel.removeAttribute('hidden');
      renderSoundCheck(campaigns, dash.agency_type, campPanel);
      renderCampaigns(campaigns, campPanel);

    } else if (scope === 'payments_only') {
      payPanel.removeAttribute('hidden');
      renderPayments(campaigns, payPanel, payAddrs);

    } else {
      // campaigns_and_payments - tab switcher
      tabsEl.removeAttribute('hidden');
      tabsEl.setAttribute('role', 'tablist');
      campPanel.removeAttribute('hidden');
      renderSoundCheck(campaigns, dash.agency_type, campPanel);
      renderCampaigns(campaigns, campPanel);
      renderPayments(campaigns, payPanel, payAddrs);

      var tabC = document.getElementById('tab-campaigns');
      var tabP = document.getElementById('tab-payments');

      // Wire the buttons as a real ARIA tablist so screen-reader and keyboard
      // users perceive the relationship and can arrow between tabs. Roving
      // tabindex: only the selected tab is in the tab order.
      campPanel.setAttribute('role', 'tabpanel');
      campPanel.setAttribute('aria-labelledby', 'tab-campaigns');
      payPanel.setAttribute('role', 'tabpanel');
      payPanel.setAttribute('aria-labelledby', 'tab-payments');
      tabC.setAttribute('role', 'tab');
      tabP.setAttribute('role', 'tab');

      function activateTab(active, inactive, activePanel, inactivePanel) {
        active.classList.add('tab-active');
        active.setAttribute('aria-selected', 'true');
        active.removeAttribute('tabindex');
        inactive.classList.remove('tab-active');
        inactive.setAttribute('aria-selected', 'false');
        inactive.setAttribute('tabindex', '-1');
        activePanel.removeAttribute('hidden');
        inactivePanel.hidden = true;
      }

      activateTab(tabC, tabP, campPanel, payPanel); // initial state

      tabC.addEventListener('click', function () { activateTab(tabC, tabP, campPanel, payPanel); });
      tabP.addEventListener('click', function () { activateTab(tabP, tabC, payPanel, campPanel); });

      // Left/Right arrows move focus + selection between the two tabs.
      tabsEl.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        if (document.activeElement === tabC) { activateTab(tabP, tabC, payPanel, campPanel); tabP.focus(); }
        else                                 { activateTab(tabC, tabP, campPanel, payPanel); tabC.focus(); }
      });
    }

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
