/* =============================================================
   site/page-creator.js: Nysterys Media
   The creator.html page's own script, extracted from the page itself.

   @security This file exists so
   script-src on creator.html can drop 'unsafe-inline'. An innerHTML assignment does not
   run a <script> tag but it does run an inline event-handler attribute, and that
   attribute needs exactly 'unsafe-inline', so leaving the directive in place made
   HTML injection here script execution on nysterys.com, the origin whose
   localStorage holds the hub session. The values are escaped as well
   (site/utils.js escapeHtml); this is the second layer, not the first.

   Load order matters and is set by the page: config.js, supabase-data.js,
   icons.js and utils.js all come first, and this runs against their globals.
   ============================================================= */

/* The cross-file globals this page uses, declared the way site/supabase-data.js
   already declares SITE_CONFIG. site/ is five classic <script> tags sharing one
   global scope at runtime and eslint reads one file at a time, so without this the
   `Lint site/` CI step calls every one of them undefined. It did: the step went red
   when these files landed and stayed red for seven pushes. */
/* global animateCounter, buildBarChart, buildDonut, buildGenderLegend, escapeHtml, ICONS, loadSiteData */

    // GENDER_COLORS, buildDonut, buildGenderLegend, animateCounter live in site/utils.js.

    /**
     * How a creator's posts spread across view bands.
     *
     * @param {Array<{label:string,count:number,pct:number}>} data - one platform's bands
     * @returns {string} the rows' markup, for a card body
     *
     * @gotcha Bars are scaled to the LARGEST band, not to 100. Most creators
     *         concentrate in one or two bands, so scaling to 100 would render
     *         every bar as a stub and the shape would be unreadable.
     */
    function buildViewDistribution(data) {
      if (!data || !data.length) return '';
      var maxPct = Math.max.apply(null, data.map(function (d) { return d.pct; })) || 1;
      return '<div class="dist-bars">' + data.map(function (band) {
        var widthPct = (band.pct / maxPct) * 100;
        return '<div class="dist-row">'
          + '<div class="dist-meta">'
          +   '<span class="dist-meta-label">' + escapeHtml(band.label)
          +     '<span class="dist-count">' + escapeHtml(band.count) + ' posts</span>'
          +   '</span>'
          +   '<span class="dist-meta-value">' + escapeHtml(band.pct) + '%</span>'
          + '</div>'
          + '<div class="bar-track">'
          +   '<div class="bar-fill" data-width="' + widthPct + '"></div>'
          + '</div>'
          + '</div>';
      }).join('') + '</div>';
    }

    /**
     * Ranked rows with a bar each: top countries, and each platform's view sources.
     *
     * @gotcha Only the top row's figure takes the orange. Every figure in orange is
     *         decoration and the eye stops sorting them; one per panel is a ranking
     *         the reader gets for free. The bars still carry the full comparison.
     */
    function buildCountryBars(data) {
      var top = (data || []).reduce(function (m, d) { return d.value > m ? d.value : m; }, 0);
      // The empty-feed guard and the max both live in site/utils.js
      // buildBarChart; only this page's markup is local. @see
      var rows = buildBarChart(data, function (country, widthPct) {
        return '<div class="country-row">'
          + '<div class="country-meta">'
          +   '<span class="country-name">' + escapeHtml(country.label) + '</span>'
          +   '<span class="country-pct' + (country.value === top ? ' country-pct-lead' : '')
          +     '">' + escapeHtml(country.value) + '%</span>'
          + '</div>'
          + '<div class="bar-track">'
          +   '<div class="bar-fill" data-width="' + widthPct + '"></div>'
          + '</div>'
          + '</div>';
      });
      return rows && '<div class="country-bars">' + rows + '</div>';
    }

    /* ── Audience Insights cards ──────────────────────────────────────────────
       One card per METRIC, comparing the platforms inside it, rather than one
       card per platform. A brand shopping for a creator is comparing her TikTok
       against her YouTube, and the platform-per-tab shape hides exactly that.

       @invariant A platform she is genuinely on but that cannot answer a card
                  renders as a stated absence, NEVER as a zero or an omission.
                  A missing bar reads as "no audience there" on a page whose
                  whole job is winning brand deals. @see site/audience.js */

    var CARD_ORDER = ['tiktok', 'youtube', 'instagram'];

    /** Platforms she is on, in a fixed order, from `socials` rather than the feeds:
     *  a platform whose importer has not run yet is still a platform she is on. */
    function herPlatforms(creator) {
      return CARD_ORDER.filter(function (k) { return creator.socials[k]; });
    }

    function platformName(key) {
      return { tiktok: 'TikTok', youtube: 'YouTube', instagram: 'Instagram' }[key] || key;
    }

    /* The stated absence. Says which platform and stops: the real reasons (a dead
     * importer, a feed that contradicts itself) are our problem, not a brand's. */
    function absentRow(key) {
      return '<div class="pf-item"><div class="pf-row pf-row-absent">'
        + '<span class="pf-icon">' + (ICONS[key] || '') + '</span>'
        + '<span class="pf-name">' + escapeHtml(platformName(key)) + '</span>'
        + '<span class="pf-absent">Not measured</span>'
        + '</div></div>';
    }

    /**
     * One metric, one bar per platform, scaled against the strongest of them.
     *
     * @param {object} card - {title, note, rows:[{key,value,display}], platforms}
     * @returns {string} card markup
     *
     * @gotcha Bars scale to the LEADER, not to an absolute ceiling, because these
     *         metrics have no natural maximum: seconds watched and followers
     *         gained share no scale, and a fixed one would flatten every card.
     *         The figure beside the bar is what carries the real magnitude.
     */
    function comparisonCard(card) {
      var max = Math.max.apply(null, card.rows.map(function (r) { return r.value; })) || 1;
      var lead = card.rows.reduce(function (b, r) { return r.value > b.value ? r : b; }, card.rows[0]);
      var byKey = {};
      card.rows.forEach(function (r) { byKey[r.key] = r; });

      var body = card.platforms.map(function (key) {
        var row = byKey[key];
        if (!row) return absentRow(key);
        return '<div class="pf-item"><div class="pf-row">'
          + '<span class="pf-icon">' + (ICONS[key] || '') + '</span>'
          + '<span class="pf-name">' + escapeHtml(platformName(key)) + '</span>'
          + '<span class="pf-bar bar-track"><span class="bar-fill" data-width="'
          +   (row.value / max) * 100 + '"></span></span>'
          + '<span class="pf-val' + (row === lead ? ' pf-val-lead' : '') + '">'
          +   escapeHtml(row.display) + '</span>'
          + '</div>'
          + (row.sub ? '<p class="pf-sub">' + escapeHtml(row.sub) + '</p>' : '')
          + '</div>';
      }).join('');

      return chartCard(card.title, body, card.note);
    }

    /**
     * One metric whose categories differ per platform, so each platform keeps its
     * own labelled panel instead of sharing a scale that would be a lie.
     *
     * @param {object} card - {title, note, panels:[{key,rows}], platforms, render}
     * @returns {string} card markup
     */
    function panelCard(card) {
      var byKey = {};
      card.panels.forEach(function (p) { byKey[p.key] = p; });
      var body = card.platforms.map(function (key) {
        var panel = byKey[key];
        if (!panel) return absentRow(key);
        return '<div class="pf-item pf-panel">'
          + '<p class="pf-panel-head"><span class="pf-icon">' + (ICONS[key] || '') + '</span>'
          +   escapeHtml(platformName(key)) + '</p>'
          + card.render(panel)
          + '</div>';
      }).join('');
      return chartCard(card.title, body, card.note, 'chart-card-wide');
    }

    /* The shared shell. `extra` widens a card that holds per-platform panels. */
    function chartCard(title, body, note, extra) {
      return '<div class="chart-card' + (extra ? ' ' + extra : '') + '">'
        + '<p class="chart-title">' + escapeHtml(title)
        +   (note ? '<span class="chart-note">' + escapeHtml(note) + '</span>' : '')
        + '</p>'
        + body
        + '</div>';
    }

    /**
     * Render the whole section, in the order a brand reads it: how she performs
     * per platform, then where the views came from, then who is watching.
     *
     * @param {object} creator - one entry of the roster, carrying platformAudience
     */
    function buildAudience(creator) {
      var el = document.getElementById('audience-cards');
      if (!el) return;
      var pa   = creator.platformAudience || {};
      var mine = herPlatforms(creator);
      var cards = [];

      cards.push(comparisonCard({
        title: 'Average Watch Time', platforms: mine,
        rows: (pa.watchTime || []).map(function (w) {
          return { key: w.key, value: w.seconds, display: w.seconds + 's' };
        })
      }));

      /* Bar is TOTAL interactions per 1,000 views, the figure that says how engaged
       * an audience is; the mix underneath is what says how. Likes outnumber
       * comments 140 to 1, so three bars on one scale would draw two hairlines. */
      cards.push(comparisonCard({
        title: 'Engagement', note: 'per 1,000 views', platforms: mine,
        rows: (pa.engagement || []).map(function (e) {
          var total = e.rows.reduce(function (s, r) { return s + r.value; }, 0);
          return {
            key: e.key, value: total,
            display: Math.round(total * 10) / 10,
            sub: e.rows.map(function (r) { return r.value + ' ' + r.label.toLowerCase(); }).join(' · ')
          };
        })
      }));

      cards.push(comparisonCard({
        title: 'Follower Growth', note: 'last 30 days', platforms: mine,
        rows: (pa.growth || []).map(function (g) {
          return { key: g.key, value: g.gained, display: '+' + g.gained.toLocaleString() };
        })
      }));

      cards.push(panelCard({
        title: 'Where Views Come From', platforms: mine,
        panels: pa.viewSources || [],
        render: function (p) { return buildCountryBars(p.rows); }
      }));

      cards.push(panelCard({
        title: 'View Distribution', platforms: mine,
        panels: (pa.viewDistribution || []).map(function (d) {
          return { key: d.key, bands: d.bands };
        }),
        render: function (p) { return buildViewDistribution(p.bands); }
      }));

      cards.push(chartCard('Gender Split',
        '<div class="donut-wrap">'
        + '<svg class="donut-svg" viewBox="0 0 36 36" id="donut-svg" role="img"'
        +   ' aria-label="Gender distribution donut chart"></svg>'
        + '<div class="donut-legend" id="gender-legend"></div>'
        + '</div>', 'TikTok only', 'chart-card-wide'));

      cards.push(chartCard('Top Countries', buildCountryBars(creator.audience.topCountries),
        'TikTok only', 'chart-card-wide'));

      el.innerHTML = cards.join('');
      buildDonut('donut-svg', creator.audience.gender);
      buildGenderLegend('gender-legend', creator.audience.gender);
    }

    // Animate bars to their target width when the card scrolls into view
    var barObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.querySelectorAll('.bar-fill').forEach(function (bar) {
            bar.style.width = bar.dataset.width + '%';
          });
          barObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2 });

    // Fade-in chart cards as they scroll into view
    var cardObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
        }
      });
    }, { threshold: 0.15 });

    /* ── Parallax on hero photo ── */
    var heroImg = document.getElementById('creator-photo');
    window.addEventListener('scroll', function() {
      if (heroImg) heroImg.style.transform = 'translateY(' + (window.scrollY * 0.28) + 'px)';
    }, { passive: true });

    /* ── Stat counter animation ── */
    // animateCounter lives in site/utils.js (shared by every page).

    /**
     * Put a failure where the profile would have been, and leave the rest of the page standing.
     *
     * The logo, the route back to the roster and the footer owe nothing to the feed, so a dead
     * feed may not take them with it. Same shape as site/page-index.js's .catch: swap the block
     * that would have carried the data, hide what would otherwise render as empty furniture.
     *
     * @security the message is written with textContent, so nothing here can build markup out
     *           of a string. The rest of this file interpolates into innerHTML and pays for
     *           that with escapeHtml on every value; a paragraph of prose needs neither.
     */
    function showProfileError(message) {
      var info = document.querySelector('.hero-info');
      if (info) {
        var p = document.createElement('p');
        p.className = 'rc-error';
        p.textContent = message;
        info.innerHTML = '';
        info.appendChild(p);
      }

      // Three chart cards with no data are furniture, not information, and the divider that
      // introduces them would otherwise stack against the footer's with nothing between them.
      var audience = document.querySelector('.audience');
      if (audience) audience.style.display = 'none';
      var rule = audience && audience.previousElementSibling;
      if (rule && rule.classList.contains('divider')) rule.style.display = 'none';
    }

    // Read creator id from the URL query string (e.g. creator.html?id=mys)
    var params = new URLSearchParams(window.location.search);
    var creatorId = params.get('id');

    loadSiteData({ withPlatformAudience: true })
      .then(function (data) {
        var creator = data.roster.find(function (c) { return c.id === creatorId; });

        if (!creator) {
          showProfileError('Creator not found.');
          return;
        }

        // Update page title
        document.title = creator.name + ' · Nysterys Media';

        // Hero fields
        var photo = document.getElementById('creator-photo');
        // Stay hidden until a real photo loads, so a missing src never shows a broken-image box.
        photo.onerror = function () { photo.hidden = true; };
        photo.src = creator.photo;
        photo.alt = creator.name;
        photo.hidden = false;

        document.getElementById('creator-tag').textContent  = creator.tag;
        document.getElementById('creator-name').textContent = creator.name;
        document.getElementById('creator-bio').textContent  = creator.bio;

        // Stats: followers, likes, engagement rate, with counter animation
        var statsEl = document.getElementById('creator-stats');
        statsEl.innerHTML =
          '<div>'
          +   '<span class="hero-stat-val" id="stat-followers"></span>'
          +   '<span class="hero-stat-lbl">Followers</span>'
          + '</div>'
          + '<div>'
          +   '<span class="hero-stat-val" id="stat-likes"></span>'
          +   '<span class="hero-stat-lbl">Likes</span>'
          + '</div>'
          + '<div>'
          +   '<span class="hero-stat-val" id="stat-eng"></span>'
          +   '<span class="hero-stat-lbl">Eng. Rate</span>'
          + '</div>';
        // Slight delay so the hero animation plays first
        setTimeout(function() {
          animateCounter(document.getElementById('stat-followers'), creator.followers,    900);
          animateCounter(document.getElementById('stat-likes'),     creator.likes,        1100);
          animateCounter(document.getElementById('stat-eng'),       creator.engagementRate, 700);
        }, 400);

        // Per-platform breakdown, same rule and wording as the roster cards:
        // a platform earns a row only above the config threshold, so these
        // deliberately do not sum to the combined figures above them.
        var platformsEl = document.getElementById('creator-platforms');
        var rows = creator.platformRows || [];
        platformsEl.innerHTML = rows.length
          ? '<p class="hero-platforms-lbl">Main platforms</p>'
            + '<ul class="hero-platform-list">' + rows.map(function (r) {
                return '<li class="hero-platform">'
                  + '<span class="hero-platform-icon">' + (ICONS[r.key] || '') + '</span>'
                  + '<span class="hero-platform-name">' + escapeHtml(r.label) + '</span>'
                  + '<span class="hero-platform-figs">'
                  +   '<span class="fig fig-followers">' + escapeHtml(r.followers) + '</span>'
                  +   '<span class="hero-platform-sep">·</span>'
                  +   '<span class="fig fig-views">' + escapeHtml(r.views) + ' views</span>'
                  +   '<span class="hero-platform-sep">·</span>'
                  +   '<span class="fig">' + escapeHtml(r.engagementRate) + '</span>'
                  + '</span>'
                  + '</li>';
              }).join('') + '</ul>'
          : '';

        // Social links
        var socialsEl = document.getElementById('creator-socials');
        socialsEl.innerHTML = Object.entries(creator.socials).map(function (entry) {
          var platform = entry[0];
          var url      = entry[1];
          return '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer" class="hero-social" aria-label="' + escapeHtml(platform) + '">'
            + ICONS[platform]
            + ' ' + escapeHtml(platform.toUpperCase())
            + '</a>';
        }).join('');

        buildAudience(creator);

        // Attach observers to each chart card
        document.querySelectorAll('.chart-card').forEach(function (card) {
          cardObserver.observe(card);
          barObserver.observe(card);
        });
      })
      .catch(function (err) {
        console.error('Could not load site data:', err);
        // Don't leave the profile half-empty: show a quiet, in-theme message.
        showProfileError('Couldn\'t load this profile right now. Please refresh the page.');
      });
