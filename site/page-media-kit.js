/* =============================================================
   site/page-media-kit.js : Nysterys Media
   The media-kit.html page's own script, extracted from the page itself.

   @security security/11-plan.md T2-13, from 05 F-15. This file exists so
   script-src on media-kit.html can drop 'unsafe-inline'. An innerHTML assignment does not
   run a <script> tag but it does run an inline event-handler attribute, and that
   attribute needs exactly 'unsafe-inline', so leaving the directive in place made
   HTML injection here script execution on nysterys.com, the origin whose
   localStorage holds the hub session. The values are escaped as well
   (site/utils.js escapeHtml); this is the second layer, not the first.

   Load order matters and is set by the page: config.js, supabase-data.js,
   icons.js and utils.js all come first, and this runs against their globals.
   ============================================================= */

    // GENDER_COLORS, animateCounter, buildDonut, buildGenderLegend live in site/utils.js.

    // Format large numbers for display
    function fmtNum(n) {
      if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
      if (n >= 1000)    return (n / 1000).toFixed(0) + 'K';
      return n.toString();
    }

    function fmtSec(s) {
      var m = Math.floor(s / 60);
      var sec = Math.round(s % 60);
      return m > 0 ? m + 'm ' + sec + 's' : sec + 's';
    }

    var counterObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(e) {
        if (e.isIntersecting && !e.target.dataset.done) {
          e.target.dataset.done = '1';
          animateCounter(e.target, e.target.dataset.target, 1200);
          counterObserver.unobserve(e.target);
        }
      });
    }, { threshold: 0.5 });

    function buildBarRows(elId, data) {
      var el = document.getElementById(elId);
      if (!el) return;
      el.innerHTML = buildBarChart(data, function (d, w) {
        return '<div class="bar-row">'
          + '<div class="bar-meta">'
          +   '<span class="bar-meta-lbl">' + escapeHtml(d.label) + '</span>'
          +   '<span class="bar-meta-val">' + escapeHtml(d.value) + '%</span>'
          + '</div>'
          + '<div class="bar-track"><div class="bar-fill" data-width="' + w + '"></div></div>'
          + '</div>';
      });
    }

    function buildDistChart(elId, data) {
      var el = document.getElementById(elId);
      if (!el) return;
      var maxPct = Math.max.apply(null, data.map(function(d) { return d.pct; }));
      el.innerHTML = '<div class="dist-chart">'
        + data.map(function(d) {
            var h = (d.pct / maxPct) * 100;
            return '<div class="dist-col">'
              + '<div class="dist-bar-wrap">'
              +   '<div class="dist-pct">' + escapeHtml(d.pct) + '%</div>'
              +   '<div class="dist-bar-outer">'
              +     '<div class="dist-bar-inner" data-height="' + h + '"></div>'
              +   '</div>'
              + '</div>'
              + '<div class="dist-label">' + escapeHtml(d.label) + '</div>'
              + '<div class="dist-count">' + escapeHtml(d.count) + ' videos</div>'
              + '</div>';
          }).join('')
        + '</div>';
    }

    // Build a full creator block HTML string
    function buildCreatorBlock(creator) {
      var s = creator.tiktokStats;
      var socialsHtml = Object.entries(creator.socials).map(function(e) {
        return '<a href="' + escapeHtml(e[1]) + '" target="_blank" rel="noopener noreferrer" class="creator-social">'
          + ICONS[e[0]] + ' ' + escapeHtml(e[0].toUpperCase()) + '</a>';
      }).join('');

      var tagsHtml = creator.contentCategories.map(function(cat) {
        return '<span class="tag">' + escapeHtml(cat) + '</span>';
      }).join('');

      return '<div class="creator-block">'

        // Photo
        + '<div class="creator-photo-wrap">'
        +   '<img src="' + escapeHtml(creator.photo) + '" alt="' + escapeHtml(creator.name) + '" />'
        + '</div>'

        // Details
        + '<div class="creator-details">'
        +   '<p class="creator-tag">Content Creator · TikTok, Instagram, YouTube</p>'
        +   '<h2 class="creator-name">' + escapeHtml(creator.name)
        +     ' <span class="creator-handle">@' + escapeHtml(creator.tiktokHandle) + '</span>'
        +   '</h2>'

        // Key metrics: now shows avg AND median views
        +   '<div class="creator-metrics">'
        +     '<div class="metric"><span class="metric-val" data-target="' + escapeHtml(creator.followers) + '"></span><span class="metric-lbl">Followers</span></div>'
        +     '<div class="metric"><span class="metric-val" data-target="' + escapeHtml(creator.likes) + '"></span><span class="metric-lbl">Total Likes</span></div>'
        +     '<div class="metric"><span class="metric-val" data-target="' + escapeHtml(creator.engagementRate) + '"></span><span class="metric-lbl">Eng. Rate</span></div>'
        +     '<div class="metric"><span class="metric-val" data-target="' + escapeHtml(fmtNum(s.avgViewsPerVideo)) + '"></span><span class="metric-lbl">Avg Views</span></div>'
        +     '<div class="metric"><span class="metric-val" data-target="' + escapeHtml(fmtNum(s.medianViewsPerVideo)) + '"></span><span class="metric-lbl">Median Views</span></div>'
        +   '</div>'

        // Bio
        +   '<p class="creator-bio">' + escapeHtml(creator.bio) + '</p>'

        // Extra stats
        +   '<div class="extra-stats">'
        +     '<div class="extra-stat"><span class="extra-stat-val">' + escapeHtml(fmtNum(s.allTimeViews)) + '</span><span class="extra-stat-lbl">All-Time Views</span></div>'
        +     '<div class="extra-stat"><span class="extra-stat-val">' + escapeHtml(s.totalVideos.toLocaleString()) + '</span><span class="extra-stat-lbl">Total Videos</span></div>'
        +     '<div class="extra-stat"><span class="extra-stat-val">' + escapeHtml(fmtSec(s.avgWatchTimeSec)) + '</span><span class="extra-stat-lbl">Avg Watch Time</span></div>'
        +   '</div>'

        // Content categories
        +   '<p class="chart-title chart-title--spaced">Content Categories</p>'
        +   '<div class="tags-wrap">' + tagsHtml + '</div>'

        // Audience charts: top row
        +   '<div class="creator-charts-wide">'
        +     '<div class="chart-card">'
        +       '<p class="chart-title">Gender Split</p>'
        +       '<div class="donut-wrap">'
        +         '<svg class="donut-svg" viewBox="0 0 36 36" id="donut-' + creator.id + '" role="img" aria-label="Gender split"></svg>'
        +         '<div class="donut-legend" id="legend-' + creator.id + '"></div>'
        +       '</div>'
        +     '</div>'
        // An Age Distribution card sat here. Its numbers were hand-typed in
        // config.js and identical for both creators; no age demographic exists
        // in any feed, so it could not be made real and was removed rather than
        // shipped to brands as measured analytics.
        +     '<div class="chart-card">'
        +       '<p class="chart-title">Top Countries</p>'
        +       '<div class="bar-rows" id="countries-' + creator.id + '"></div>'
        +     '</div>'
        +   '</div>'

        // View distribution: full width below
        +   '<div class="chart-card chart-card--spaced">'
        +     '<p class="chart-title">View Distribution · % of Videos by View Count Bucket</p>'
        +     '<div id="dist-' + creator.id + '"></div>'
        +   '</div>'

        // Social links + SocialBlade
        +   '<div class="creator-socials">'
        +     socialsHtml
        +     '<a href="https://socialblade.com/tiktok/user/' + creator.tiktokHandle + '" target="_blank" rel="noopener noreferrer" class="creator-social">'
        +       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="12" height="12"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>'
        +       ' SOCIALBLADE'
        +     '</a>'
        +   '</div>'

        + '</div>'
      + '</div>';
    }

    // Intersection observer for bar animation (horizontal and vertical)
    var barObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.querySelectorAll('.bar-fill').forEach(function(bar) {
            bar.style.width = bar.dataset.width + '%';
          });
          entry.target.querySelectorAll('.dist-bar-inner').forEach(function(bar) {
            bar.style.height = bar.dataset.height + '%';
          });
          barObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    // Intersection observer for fade-in
    var fadeObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
        }
      });
    }, { threshold: 0.08 });

    // Scroll reveal for static sections
    var staticObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(e) {
        if (e.isIntersecting) {
          e.target.style.opacity = '1';
          e.target.style.transform = 'translateY(0)';
          staticObserver.unobserve(e.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.philosophy-card, .philosophy-body, .process-step, .process-term, .process-note, .section-header').forEach(function(el) {
      el.style.opacity = '0';
      el.style.transform = 'translateY(24px)';
      el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
      staticObserver.observe(el);
    });

    // Stagger within groups that enter the viewport together
    [
      { sel: '.philosophy-card', delay: 100 },
      { sel: '.process-step',    delay: 80  },
      { sel: '.process-term',    delay: 100 },
    ].forEach(function(g) {
      document.querySelectorAll(g.sel).forEach(function(el, i) {
        el.style.transitionDelay = (i * g.delay) + 'ms';
      });
    });

    loadSiteData()
      .then(function(data) {

        // Overview stats
        var overviewGrid = document.getElementById('overview-grid');
        if (overviewGrid) {
          overviewGrid.innerHTML = data.mediaKit.rosterOverview.map(function(s) {
            return '<div class="overview-stat">'
              + '<div class="overview-val" data-target="' + escapeHtml(s.value) + '"></div>'
              + '<div class="overview-lbl">' + escapeHtml(s.label) + '</div>'
              + '</div>';
          }).join('');
          overviewGrid.querySelectorAll('.overview-stat').forEach(function(el, i) {
            el.style.opacity = '0';
            el.style.transform = 'translateY(20px)';
            el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
            el.style.transitionDelay = (i * 100) + 'ms';
            fadeObserver.observe(el);
            var val = el.querySelector('.overview-val[data-target]');
            if (val) counterObserver.observe(val);
          });
        }

        // Brand categories
        var collabGrid = document.getElementById('collab-grid');
        if (collabGrid) {
          collabGrid.innerHTML = data.mediaKit.brandCategories.map(function(cat) {
            return '<div class="collab-item">' + escapeHtml(cat) + '</div>';
          }).join('');
        }

        // Creator blocks
        var blocksEl = document.getElementById('creator-blocks');
        if (blocksEl) {
          // Render Mys first (larger audience), then Kym
          var ordered = data.roster.slice().sort(function(a, b) {
            return b.tiktokStats.followers - a.tiktokStats.followers;
          });

          blocksEl.innerHTML = ordered.map(buildCreatorBlock).join('');

          // Now build charts (DOM must exist first)
          ordered.forEach(function(creator) {
            buildDonut('donut-' + creator.id, creator.audience.gender);
            buildGenderLegend('legend-' + creator.id, creator.audience.gender);
            buildBarRows('countries-' + creator.id, creator.audience.topCountries);
            buildDistChart('dist-' + creator.id, creator.tiktokStats.viewDistribution);
          });

          // Counter animation for per-creator metric values
          document.querySelectorAll('.metric-val[data-target]').forEach(function(el) {
            counterObserver.observe(el);
          });
        }

        // Attach observers
        document.querySelectorAll('.chart-card').forEach(function(card) {
          barObserver.observe(card);
        });

        document.querySelectorAll('.creator-block, .collab-item').forEach(function(el) {
          el.style.opacity = '0';
          el.style.transform = 'translateY(20px)';
          el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
          fadeObserver.observe(el);
        });
      })
      .catch(function(err) {
        console.error('Could not load site data:', err);
        // Don't leave the page blank on failure: show a quiet, in-theme message.
        var blocks = document.getElementById('creator-blocks');
        if (blocks && !blocks.children.length) {
          blocks.innerHTML = '<p class="mk-fallback">Couldn\'t load the media kit right now. Please refresh the page.</p>';
        }
      });
