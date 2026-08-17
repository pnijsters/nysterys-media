/* =============================================================
   site/page-creator.js : Nysterys Media
   The creator.html page's own script, extracted from the page itself.

   @security security/11-plan.md T2-13, from 05 F-15. This file exists so
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

    // Build age distribution horizontal bars
    /**
     * How a creator's posts spread across view bands.
     *
     * @param {Array<{label:string,count:number,pct:number}>} data
     *        creator.tiktokStats.viewDistribution, computed from live video rows
     *
     * @gotcha Bars are scaled to the LARGEST band, not to 100. Most creators
     *         concentrate in one or two bands, so scaling to 100 would render
     *         every bar as a stub and the shape would be unreadable.
     */
    function buildViewDistribution(data) {
      var el = document.getElementById('dist-bars');
      if (!el) return;
      if (!data || !data.length) { el.innerHTML = ''; return; }
      var maxPct = Math.max.apply(null, data.map(function (d) { return d.pct; })) || 1;
      el.innerHTML = data.map(function (band) {
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
      }).join('');
    }

    // Build top countries horizontal bars
    function buildCountryBars(data) {
      var el = document.getElementById('country-bars');
      if (!el) return;
      // The empty-feed guard and the max both live in site/utils.js
      // buildBarChart; only this page's markup is local. @see W-32
      el.innerHTML = buildBarChart(data, function (country, widthPct) {
        return '<div class="country-row">'
          + '<div class="country-meta">'
          +   '<span class="country-name">' + escapeHtml(country.label) + '</span>'
          +   '<span class="country-pct">' + escapeHtml(country.value) + '%</span>'
          + '</div>'
          + '<div class="bar-track">'
          +   '<div class="bar-fill" data-width="' + widthPct + '"></div>'
          + '</div>'
          + '</div>';
      });
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

    // Read creator id from the URL query string (e.g. creator.html?id=mys)
    var params = new URLSearchParams(window.location.search);
    var creatorId = params.get('id');

    loadSiteData()
      .then(function (data) {
        var creator = data.roster.find(function (c) { return c.id === creatorId; });

        if (!creator) {
          document.body.innerHTML = '<p class="rc-error">Creator not found.</p>';
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

        // Build the three charts
        buildDonut('donut-svg', creator.audience.gender);
        buildGenderLegend('gender-legend', creator.audience.gender);
        buildViewDistribution(creator.tiktokStats.viewDistribution);
        buildCountryBars(creator.audience.topCountries);

        // Attach observers to each chart card
        document.querySelectorAll('.chart-card').forEach(function (card) {
          cardObserver.observe(card);
          barObserver.observe(card);
        });
      })
      .catch(function (err) {
        console.error('Could not load site data:', err);
        // Don't leave the profile half-empty: show a quiet, in-theme message.
        document.body.innerHTML = '<p class="rc-error">Couldn\'t load this profile right now. Please refresh the page.</p>';
      });
