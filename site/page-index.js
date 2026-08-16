/* =============================================================
   site/page-index.js : Nysterys Media
   The index.html page's own script, extracted from the page itself.

   @security security/11-plan.md T2-13, from 05 F-15. This file exists so
   script-src on index.html can drop 'unsafe-inline'. An innerHTML assignment does not
   run a <script> tag but it does run an inline event-handler attribute, and that
   attribute needs exactly 'unsafe-inline', so leaving the directive in place made
   HTML injection here script execution on nysterys.com, the origin whose
   localStorage holds the hub session. The values are escaped as well
   (site/utils.js escapeHtml); this is the second layer, not the first.

   Load order matters and is set by the page: config.js, supabase-data.js,
   icons.js and utils.js all come first, and this runs against their globals.
   ============================================================= */

  /* ── Fade-in on scroll ── */
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(e) {
      if (e.isIntersecting) {
        e.target.style.opacity = '1';
        e.target.style.transform = 'translateY(0)';
        var delay = parseFloat(e.target.style.transitionDelay) || 0;
        setTimeout(function() {
          e.target.style.transition = '';
          e.target.style.transitionDelay = '';
        }, 750 + delay);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -50px 0px' });

  document.querySelectorAll('.about, .services, .stat, .service-card, .partner-card, .partner-nope').forEach(function(el) {
    el.style.opacity = '0';
    el.style.transform = 'translateY(32px)';
    el.style.transition = 'opacity .7s ease, transform .7s ease';
    observer.observe(el);
  });

  // Stagger stat tile entry: each tile slides in 110ms after the previous
  document.querySelectorAll('.about-stats .stat').forEach(function(el, i) {
    el.style.transitionDelay = (i * 110) + 'ms';
  });

  /* ── Stat counter animation ── */
  /* animateCounter lives in site/utils.js (shared by every page). */

  /* Trigger counter when stat tile scrolls into view */
  var counterObserver = new IntersectionObserver(function(entries) {
    entries.forEach(function(e) {
      if (e.isIntersecting) {
        var numEl = e.target.querySelector('.stat-number[data-target]');
        if (numEl && !numEl.dataset.done) {
          numEl.dataset.done = '1';
          animateCounter(numEl, numEl.dataset.target, 1200);
        }
      }
    });
  }, { threshold: 0.5 });

   const ICONS = {
  tiktok: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".5" fill="currentColor"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23 7s-.3-2-1.2-2.8c-1.1-1.2-2.4-1.2-3-1.3C16.6 2.8 12 2.8 12 2.8s-4.6 0-6.8.2c-.6 0-1.9.1-3 1.3C1.3 5 1 7 1 7S.7 9.2.7 11.5v2.1C.7 16 1 18 1 18s.3 2 1.2 2.8c1.1 1.2 2.6 1.1 3.3 1.2C7.6 22.2 12 22.2 12 22.2s4.6 0 6.8-.3c.6-.1 1.9-.1 3-1.3.9-.8 1.2-2.8 1.2-2.8s.3-2.2.3-4.4v-2.1C23.3 9.2 23 7 23 7zM9.7 15.5V8.4l8.1 3.6-8.1 3.5z"/></svg>'
};

function buildSocialLink(platform, url) {
  return '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener" class="talent-social" aria-label="' + escapeHtml(platform) + '">' +
    ICONS[platform] + ' ' + escapeHtml(platform.toUpperCase()) + '</a>';
}

/**
 * Render the per-platform breakdown under a roster card's combined figures.
 *
 * @param {Array} rows - creator.platformRows from site/supabase-data.js
 * @returns {string} markup, or '' when no platform clears the bar
 *
 * @gotcha These rows deliberately do NOT sum to the combined figures above:
 *         platforms under the threshold are omitted. Hence "Main platforms",
 *         which reports rather than claims completeness. @see site/config.js
 */
function buildPlatformRows(rows) {
  if (!rows || !rows.length) return '';
  var items = rows.map(function (r) {
    return '<li class="talent-platform">' +
      '<span class="talent-platform-icon">' + (ICONS[r.key] || '') + '</span>' +
      '<span class="talent-platform-name">' + escapeHtml(r.label) + '</span>' +
      '<span class="talent-platform-figs">' +
        '<span class="fig fig-followers">' + escapeHtml(r.followers) + '</span>' +
        '<span class="talent-platform-sep">·</span>' +
        '<span class="fig fig-views">' + escapeHtml(r.views) + ' views</span>' +
        '<span class="talent-platform-sep">·</span>' +
        '<span class="fig">' + escapeHtml(r.engagementRate) + '</span>' +
      '</span>' +
    '</li>';
  }).join('');
  return '<div class="talent-platforms">' +
    '<p class="talent-platforms-lbl">Main platforms</p>' +
    '<ul class="talent-platform-list">' + items + '</ul>' +
  '</div>';
}

function buildTalentCard(creator) {
  var socials = Object.entries(creator.socials)
    .map(function(entry) { return buildSocialLink(entry[0], entry[1]); })
    .join('');
  return '<div class="talent-card" onclick="window.location=\'creator.html?id=' + escapeHtml(encodeURIComponent(creator.id)) + '\'">' +
    '<div class="talent-photo">' +
      '<img src="' + escapeHtml(creator.photo) + '" loading="lazy" decoding="async" alt="' + escapeHtml(creator.name) + '" />' +
    '</div>' +
    '<div class="talent-body">' +
      '<p class="talent-tag">' + escapeHtml(creator.tag) + '</p>' +
      '<h3 class="talent-name">' + escapeHtml(creator.name) + ' <span class="talent-handle">@' + escapeHtml(creator.socials.tiktok.split('@').pop()) + '</span></h3>' +
      '<div class="talent-stats">' +
        '<div class="talent-stat"><span class="stat-val">' + escapeHtml(creator.followers) + '</span><span class="stat-lbl">Followers</span></div>' +
        '<div class="talent-stat"><span class="stat-val">' + escapeHtml(creator.likes) + '</span><span class="stat-lbl">Likes</span></div>' +
        '<div class="talent-stat"><span class="stat-val">' + escapeHtml(creator.engagementRate) + '</span><span class="stat-lbl">Eng. Rate</span></div>' +
      '</div>' +
      buildPlatformRows(creator.platformRows) +
      '<p class="talent-bio">' + escapeHtml(creator.bio) + '</p>' +
      '<div class="talent-socials">' + socials + '</div>' +
    '</div>' +
  '</div>';
}

loadSiteData()
  .then(function(data) {

    // Populate about stats: store target on el, fire counter via observer
    data.about.stats.forEach(function(s, i) {
      var val  = document.getElementById('about-stat-val-' + i);
      var lbl  = document.getElementById('about-stat-lbl-' + i);
      var tile = val && val.closest('.stat');
      if (val) val.dataset.target = s.value;
      if (lbl) lbl.textContent = s.label;
      if (tile) counterObserver.observe(tile);
    });

    // Build and inject talent cards (replaces skeleton)
    var grid = document.getElementById('roster-grid');
    if (grid) {
      grid.innerHTML = data.roster.map(buildTalentCard).join('');
      grid.querySelectorAll('.talent-card').forEach(function(el) {
        el.style.opacity = '0';
        el.style.transform = 'translateY(32px)';
        el.style.transition = 'opacity .7s ease, transform .7s ease';
        observer.observe(el);
      });
    }

    // Build marquee with live data (doubled for seamless loop)
    var kym = data.roster.find(function(c) { return c.id === 'kym'; }) || {};
    var mys = data.roster.find(function(c) { return c.id === 'mys'; }) || {};
    var items = [
      mys.followers + ' Followers',
      mys.likes + ' Likes',
      mys.engagementRate + ' Eng. Rate',
      '@mysthegreat',
      kym.followers + ' Followers',
      kym.likes + ' Likes',
      kym.engagementRate + ' Eng. Rate',
      '@kymchi_n_crackers',
      'Music · Fashion · Lifestyle',
      'TikTok · YouTube · Instagram',
    ];
    var html = items.map(function(t) {
      return '<span class="marquee-item">' + escapeHtml(t) + '<span class="marquee-dot">·</span></span>';
    }).join('');
    var track = document.getElementById('marquee-track');
    if (track) track.innerHTML = html + html; // doubled for seamless loop
  })
  .catch(function(err) {
    console.error('Could not load site data:', err);
    // Don't leave the roster skeleton spinning forever: swap in a quiet, in-theme message.
    var grid = document.getElementById('roster-grid');
    if (grid) grid.innerHTML = '<p class="roster-fallback">Our roster is taking a moment to load. Please refresh the page.</p>';
    // Hide the about stats rather than leave blank tiles. The marquee keeps its static fallback.
    var aboutStats = document.querySelector('.about-stats');
    if (aboutStats) aboutStats.style.display = 'none';
  });

    initEmail('#contact-email-link');
