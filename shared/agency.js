/* Nysterys Agency Dashboard — vanilla JS, no framework, no Supabase SDK.
   Only network call: one GET to the edge function URL below.
   All user-supplied content is set via textContent — never innerHTML. */
(function () {
  'use strict';

  var EDGE = 'https://rnntuxabccnphfvvvaks.supabase.co/functions/v1/agency-dashboard';

  // ── Creator profiles (static, keyed by creator_name from API) ──────────────

  var CREATORS = {
    'Mys Nijsters': {
      handle:    '@mysthegreat',
      bio:       'Breakout lifestyle and trend creator with over 1.4 million TikTok followers and 54 million likes. Known for her magnetic energy, swag-forward content, and deeply personal storytelling — she has built one of the most engaged young audiences on the platform.',
      followers: 1385831,
      avatar:    'mys.jpg',
    },
    'Kym Nijsters': {
      handle:    '@kymchi_n_crackers',
      bio:       'Lifestyle and fashion creator known for her fit checks, authentic storytelling, and relatable everyday content. With a natural presence on camera and a growing, engaged community, she consistently connects with her audience on a personal level.',
      followers: 224600,
      avatar:    'kym.jpg',
    },
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

  // ── Badge ────────────────────────────────────────────────────────────────────

  function badge(status) {
    var b = el('span', 'badge badge-' + (status || 'default').replace(/\s+/g, '-'));
    b.textContent = status || '';
    return b;
  }

  // ── Count-up animation ────────────────────────────────────────────────────────

  function countUp(el, target, fmtFn, duration) {
    if (!target || target <= 0) { el.textContent = fmtFn(0); return; }
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

  function countUpFloat(el, target, decimals, suffix, duration) {
    if (!target || target <= 0) { el.textContent = (0).toFixed(decimals) + suffix; return; }
    duration = duration || 1400;
    var steps = 55;
    var interval = Math.max(duration / steps, 14);
    var step = 0;
    var timer = setInterval(function () {
      step++;
      var progress = step / steps;
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = (eased * target).toFixed(decimals) + suffix;
      if (step >= steps) { el.textContent = target.toFixed(decimals) + suffix; clearInterval(timer); }
    }, interval);
  }

  // ── Compute summary stats from campaign data ─────────────────────────────────

  function computeSummary(campaigns) {
    var totalViews = 0, totalLikes = 0, totalER = 0, erCount = 0;
    campaigns.forEach(function (c) {
      c.deliverables.forEach(function (d) {
        if (d.stats) {
          totalViews += d.stats.views    || 0;
          totalLikes += d.stats.likes    || 0;
          totalER    += d.stats.engagement_rate || 0;
          erCount++;
        }
      });
    });
    return {
      totalViews:    totalViews,
      totalLikes:    totalLikes,
      avgER:         erCount > 0 ? (totalER / erCount) : 0,
      campaignCount: campaigns.length,
    };
  }

  // ── Error screen ──────────────────────────────────────────────────────────────

  var ERRORS = {
    'not-found':    { icon: '404', title: 'Dashboard not found',  body: 'This link may have expired or been deactivated. Contact the creator for a new link.' },
    'no-token':     { icon: '?',   title: 'Invalid link',         body: 'No dashboard token was found in this URL.' },
    'timeout':      { icon: '⏱',  title: 'Request timed out',    body: 'The server took too long to respond. Please try again in a moment.' },
    'network':      { icon: '⚡',  title: 'Connection error',     body: 'Unable to load the dashboard. Check your connection and try again.' },
    'server-error': { icon: '!',   title: 'Server error',         body: 'Something went wrong on our end. Please try again shortly.' },
  };

  function showError(type) {
    var cfg = ERRORS[type] || ERRORS['server-error'];
    document.getElementById('loading-state').hidden = true;
    document.getElementById('error-icon').textContent  = cfg.icon;
    document.getElementById('error-title').textContent = cfg.title;
    document.getElementById('error-body').textContent  = cfg.body;
    document.getElementById('error-state').removeAttribute('hidden');
  }

  // ── Creator hero ──────────────────────────────────────────────────────────────

  function renderCreatorHero(dash, summary) {
    var profile = CREATORS[dash.creator_name] || null;
    var avatarEl = document.getElementById('hero-avatar');

    if (profile && profile.avatar) {
      avatarEl.src = profile.avatar;
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

    document.getElementById('hero-handle').textContent = (profile && profile.handle) ? profile.handle : '';
    document.getElementById('hero-name').textContent   = dash.creator_name || '';
    document.getElementById('hero-bio').textContent    = (profile && profile.bio) ? profile.bio : '';
    document.getElementById('hero-agency-name').textContent = dash.agency_name || '';

    // Stat pills — two labeled groups: global creator stats vs this-dashboard stats
    var statsEl = document.getElementById('hero-stats');
    var followers = profile ? profile.followers : null;

    var groups = [
      {
        groupLabel: 'Creator',
        stats: [
          { label: 'Followers', rawVal: followers, isFlt: false, hasAnim: false },
        ],
      },
      {
        groupLabel: 'This Dashboard',
        stats: [
          { label: 'Total Views',    rawVal: summary.totalViews,    isFlt: false, hasAnim: summary.totalViews > 0 },
          { label: 'Avg Engagement', rawVal: summary.avgER,         isFlt: true,  hasAnim: summary.avgER > 0, suffix: '%', decimals: 1 },
          { label: 'Campaigns',      rawVal: summary.campaignCount, isFlt: false, hasAnim: false },
        ],
      },
    ];

    var animIdx = 0;
    groups.forEach(function (group) {
      var groupEl = el('div', 'hero-stat-group');

      var groupLbl = el('div', 'hero-stat-group-label');
      groupLbl.textContent = group.groupLabel;
      groupEl.appendChild(groupLbl);

      var pillsEl = el('div', 'hero-stat-group-pills');

      group.stats.forEach(function (s) {
        var i = animIdx++;
        var pill = el('div', 'hero-stat');
        pill.style.animationDelay = (i * 0.09) + 's';

        var valEl = el('div', 'hero-stat-value');
        if (s.rawVal == null || (s.rawVal === 0 && s.label === 'Followers')) {
          valEl.textContent = '—';
        } else if (s.isFlt) {
          valEl.textContent = s.rawVal > 0 ? s.rawVal.toFixed(1) + (s.suffix || '') : '—';
        } else {
          valEl.textContent = fmtNum(s.rawVal);
        }

        var lblEl = el('div', 'hero-stat-label');
        lblEl.textContent = s.label;
        append(pill, valEl, lblEl);
        pillsEl.appendChild(pill);

        if (s.hasAnim) {
          setTimeout(function () {
            if (s.isFlt) {
              countUpFloat(valEl, s.rawVal, s.decimals || 1, s.suffix || '', 1500);
            } else {
              countUp(valEl, s.rawVal, fmtNum, 1500);
            }
          }, 500 + i * 100);
        }
      });

      append(groupEl, pillsEl);
      statsEl.appendChild(groupEl);
    });
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
      // Extract agency name from campaign name format: yyyymmdd-NN-Creator-Agency
      var parts   = (c.name || '').split('-');
      var agency  = parts.length >= 4 ? parts.slice(3).join('-') : (c.name || '');

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

  // ── Thumbnail strip ────────────────────────────────────────────────────────────

  function renderThumbStrip(deliverables) {
    var withMedia = deliverables.filter(function (d) {
      return d.cover_image_url || d.post_url;
    });
    if (withMedia.length === 0) return null;

    var strip = el('div', 'thumb-strip');

    withMedia.forEach(function (d) {
      var link    = safeLink(d.post_url);
      var imgUrl  = safeLink(d.cover_image_url);

      var item = link ? el('a', 'thumb-item') : el('div', 'thumb-item');
      if (link) {
        item.href   = link;
        item.target = '_blank';
        item.rel    = 'noopener noreferrer';
      }

      if (imgUrl) {
        var img = el('img');
        img.src     = imgUrl;
        img.alt     = 'Post preview';
        img.loading = 'lazy';
        img.onerror = function () {
          // Signed CDN URLs expire within ~24h — swap in a styled placeholder
          var ph = el('div', 'thumb-placeholder');
          ph.textContent = '▶';
          item.innerHTML = '';
          item.appendChild(ph);
        };
        var play = el('div', 'thumb-item-play');
        play.textContent = '▶';
        append(item, img, play);
      } else {
        var ph = el('div', 'thumb-placeholder');
        ph.textContent = '▶';
        item.appendChild(ph);
      }

      strip.appendChild(item);
    });

    return strip;
  }

  // ── Campaign stats aggregate ───────────────────────────────────────────────────

  function sumStats(deliverables) {
    var totals = { views: 0, likes: 0, comments: 0, shares: 0, hasStats: false };
    deliverables.forEach(function (d) {
      if (d.stats) {
        totals.views    += d.stats.views    || 0;
        totals.likes    += d.stats.likes    || 0;
        totals.comments += d.stats.comments || 0;
        totals.shares   += d.stats.shares   || 0;
        totals.hasStats = true;
      }
    });
    return totals;
  }

  // ── Render: campaigns panel ────────────────────────────────────────────────────

  function renderCampaigns(campaigns, container) {
    if (!campaigns || campaigns.length === 0) {
      var empty = el('div', 'empty-msg');
      empty.textContent = 'No campaigns found for this dashboard.';
      container.appendChild(empty);
      return;
    }

    campaigns.forEach(function (campaign, cardIdx) {
      var card = el('div', 'campaign-card');
      card.style.animationDelay = (cardIdx * 0.07) + 's';

      // Card header
      var head = el('div', 'campaign-head');
      var nameGroup = el('div', 'campaign-name-group');
      var nameEl = el('div', 'campaign-name');
      nameEl.textContent = campaign.name || '';
      var datesEl = el('div', 'campaign-dates');
      var startStr = fmtDate(campaign.start_date);
      var endStr   = fmtDate(campaign.end_date);
      datesEl.textContent = (startStr !== '—' || endStr !== '—') ? startStr + ' – ' + endStr : '';
      append(nameGroup, nameEl, datesEl);

      var badgesWrap = el('div', 'campaign-badges');
      badgesWrap.appendChild(badge(campaign.status));
      if (campaign.payment) {
        var payStatus = campaign.payment.is_in_kind ? 'In-Kind' : (campaign.payment.status || 'Not-Invoiced');
        badgesWrap.appendChild(badge(payStatus));
      }
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

      // Thumbnail strip (posted content only)
      var strip = renderThumbStrip(delivs);
      if (strip) card.appendChild(strip);

      // Deliverables table
      var sectionLabel = el('div', 'section-label');
      sectionLabel.textContent = 'Deliverables';
      card.appendChild(sectionLabel);

      var tableWrap = el('div', 'table-wrap');
      var table = el('table');

      var thead = el('thead');
      var hr = el('tr');
      var cols = ['Platform', 'Type', 'Status', 'Due Date', 'Posted', 'Link', 'Views', 'Likes', 'Comments', 'Shares', 'ER%'];
      cols.forEach(function (c) {
        var th = el('th');
        if (['Views','Likes','Comments','Shares','ER%'].indexOf(c) !== -1) th.className = 'num-cell';
        th.textContent = c;
        hr.appendChild(th);
      });
      thead.appendChild(hr);
      table.appendChild(thead);

      var tbody = el('tbody');
      delivs.forEach(function (d) {
        var row = el('tr');

        function tdTxt(val, cls) {
          var td = el('td', cls || '');
          td.textContent = (val == null || val === '') ? '—' : String(val);
          return td;
        }

        row.appendChild(tdTxt(d.platform));
        row.appendChild(tdTxt(d.type));

        var statusTd = el('td');
        statusTd.appendChild(badge(d.status));
        row.appendChild(statusTd);

        row.appendChild(tdTxt(fmtDate(d.due_date), 'muted-cell'));
        row.appendChild(tdTxt(fmtDate(d.posted_date), 'muted-cell'));

        var linkTd = el('td');
        var href = safeLink(d.post_url);
        if (href) {
          var a = el('a', 'post-link');
          a.href   = href;
          a.target = '_blank';
          a.rel    = 'noopener noreferrer';
          a.textContent = '↗ View';
          linkTd.appendChild(a);
        } else {
          linkTd.textContent = '—';
        }
        row.appendChild(linkTd);

        var s = d.stats;
        row.appendChild(tdTxt(s ? fmtNum(s.views)            : '—', 'num-cell'));
        row.appendChild(tdTxt(s ? fmtNum(s.likes)            : '—', 'num-cell'));
        row.appendChild(tdTxt(s ? fmtNum(s.comments)         : '—', 'num-cell'));
        row.appendChild(tdTxt(s ? fmtNum(s.shares)           : '—', 'num-cell'));
        row.appendChild(tdTxt(s ? fmtRate(s.engagement_rate) : '—', 'num-cell'));

        tbody.appendChild(row);
      });
      table.appendChild(tbody);
      tableWrap.appendChild(table);
      card.appendChild(tableWrap);

      // Aggregate stats bar
      var totals = sumStats(delivs);
      if (totals.hasStats) {
        var statsRow = el('div', 'campaign-stats-row');
        var metrics = [
          { label: 'Total Views',    value: fmtNum(totals.views) },
          { label: 'Total Likes',    value: fmtNum(totals.likes) },
          { label: 'Total Comments', value: fmtNum(totals.comments) },
          { label: 'Total Shares',   value: fmtNum(totals.shares) },
        ];
        metrics.forEach(function (m) {
          var pill   = el('div', 'stat-pill');
          var valEl  = el('div', 'stat-pill-value');
          valEl.textContent = m.value;
          var lblEl  = el('div', 'stat-pill-label');
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

      var header = el('div', 'pay-addr-header');
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

        // Detect link type
        if (/^https?:\/\//i.test(addr)) {
          href = safeLink(addr);
        } else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
          href = 'mailto:' + addr;
        }

        if (href) {
          var a = el('a', 'pay-addr-link');
          a.href   = href;
          if (/^https?:/.test(href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
          a.textContent = addr;
          valueEl.appendChild(a);
          if (/^https?:/.test(href)) {
            var arrow = el('span', 'pay-addr-arrow');
            arrow.textContent = ' ↗';
            valueEl.appendChild(arrow);
          }
        } else {
          valueEl.textContent = addr;
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

  function renderPayments(campaigns, container, paymentAddresses) {
    renderPaymentAddresses(paymentAddresses, container);

    var withPayment = campaigns.filter(function (c) { return c.payment != null; });

    if (withPayment.length === 0) {
      var empty = el('div', 'empty-msg');
      empty.textContent = 'No payment information available for these campaigns.';
      container.appendChild(empty);
      return;
    }

    // Payment summary row
    var total = 0, paid = 0, pendingAmt = 0, notInvoiced = 0;
    withPayment.forEach(function (c) {
      var p = c.payment;
      if (p.is_in_kind) return;
      var amt = Number(p.amount) || 0;
      total += amt;
      var st = (p.status || '').toLowerCase();
      if (st === 'paid')                          paid        += amt;
      else if (st === 'pending' || st === 'invoiced') pendingAmt  += amt;
      else                                        notInvoiced += amt;
    });

    var summaryEl = el('div', 'payment-summary');
    var summaryItems = [
      { label: 'Total Value',        value: fmtMoney(total),      color: null },
      { label: 'Paid',               value: fmtMoney(paid),       color: paid        > 0 ? 'var(--green)'   : null },
      { label: 'Pending / Invoiced', value: fmtMoney(pendingAmt), color: pendingAmt  > 0 ? 'var(--orange2)' : null },
      { label: 'Not Yet Invoiced',   value: fmtMoney(notInvoiced),color: null },
    ];
    summaryItems.forEach(function (item) {
      var cell  = el('div', 'psum-cell');
      var valEl = el('div', 'psum-value');
      valEl.textContent = item.value;
      if (item.color) valEl.style.color = item.color;
      var lblEl = el('div', 'psum-label');
      lblEl.textContent = item.label;
      append(cell, valEl, lblEl);
      summaryEl.appendChild(cell);
    });
    container.appendChild(summaryEl);

    // Payments table
    var wrap      = el('div', 'payments-section');
    var tableWrap = el('div', 'table-wrap');
    var table     = el('table');

    var thead = el('thead');
    var hr    = el('tr');
    ['Campaign', 'Status', 'Amount', 'Invoice Date', 'Paid Date'].forEach(function (c) {
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

      var nameTd = el('td');
      nameTd.textContent = c.name || '';
      row.appendChild(nameTd);

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

      var invTd  = el('td', 'muted-cell');
      invTd.textContent  = fmtDate(p.invoice_date);
      row.appendChild(invTd);

      var paidTd = el('td', 'muted-cell');
      paidTd.textContent = fmtDate(p.paid_date);
      row.appendChild(paidTd);

      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    tableWrap.appendChild(table);
    wrap.appendChild(tableWrap);
    container.appendChild(wrap);
  }

  // ── Render: full dashboard ─────────────────────────────────────────────────────

  function renderDashboard(data) {
    var dash      = data.dashboard;
    var campaigns = data.campaigns || [];
    var scope     = dash.scope;
    var summary   = computeSummary(campaigns);

    document.getElementById('loading-state').hidden = true;

    renderCreatorHero(dash, summary);

    var tabsEl    = document.getElementById('tabs');
    var campPanel = document.getElementById('campaigns-panel');
    var payPanel  = document.getElementById('payments-panel');
    var dashboard = document.getElementById('dashboard');
    var payAddrs  = dash.payment_addresses || [];

    dashboard.removeAttribute('hidden');

    // Performance chart — only when there are campaigns with stats
    if (scope !== 'payments_only') {
      renderPerfChart(campaigns);
    }

    if (scope === 'campaigns_only') {
      campPanel.removeAttribute('hidden');
      renderCampaigns(campaigns, campPanel);

    } else if (scope === 'payments_only') {
      payPanel.removeAttribute('hidden');
      renderPayments(campaigns, payPanel, payAddrs);

    } else {
      // campaigns_and_payments — tab switcher
      tabsEl.removeAttribute('hidden');
      campPanel.removeAttribute('hidden');
      renderCampaigns(campaigns, campPanel);
      renderPayments(campaigns, payPanel, payAddrs);

      var tabC = document.getElementById('tab-campaigns');
      var tabP = document.getElementById('tab-payments');

      tabC.addEventListener('click', function () {
        tabC.classList.add('tab-active');
        tabP.classList.remove('tab-active');
        campPanel.removeAttribute('hidden');
        payPanel.hidden = true;
      });

      tabP.addEventListener('click', function () {
        tabP.classList.add('tab-active');
        tabC.classList.remove('tab-active');
        payPanel.removeAttribute('hidden');
        campPanel.hidden = true;
      });
    }
  }

  // ── Entry point ────────────────────────────────────────────────────────────────

  function init() {
    var token = new URLSearchParams(window.location.search).get('t') || '';

    if (!token) {
      showError('no-token');
      return;
    }

    var ac    = new AbortController();
    var timer = setTimeout(function () { ac.abort(); }, 12000);

    fetch(EDGE + '?token=' + encodeURIComponent(token), {
      method:  'GET',
      headers: { 'Accept': 'application/json' },
      signal:  ac.signal,
    })
      .then(function (res) {
        clearTimeout(timer);
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
