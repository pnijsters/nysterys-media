/**
 * site/supabase-data.js - live creator stats for the public marketing pages.
 *
 * Fetches every platform feed with the ANON key and returns the data shape the
 * pages previously read from data.json. Requires config.js (SITE_CONFIG) first.
 *
 * Used by: index.html, creator.html, media-kit.html, rate-card.html.
 *
 * The headline creator fields (followers / likes / engagementRate) and the
 * About tiles are CROSS-PLATFORM totals: TikTok + YouTube today, Instagram the
 * moment its feed lands. Per-platform detail stays in `platforms`, and the
 * TikTok-only deep dive (view distribution, audience, watch time) stays in
 * `tiktokStats` because the media kit and rate card price TikTok posts off it.
 *
 * @gotcha Every feed here is read as an unauthenticated visitor, so each view
 *         needs its own `grant select ... to anon`. Recreating a view drops the
 *         grant and silently blanks the public site.
 * @gotcha YouTube like/comment/share counts are DAILY deltas, not lifetime
 *         per-video counters like TikTok's. See buildYouTube.
 */
(function () {
  var URL  = 'https://rnntuxabccnphfvvvaks.supabase.co';
  var KEY  = 'sb_publishable_uTUIIpWaYYgke_5rtyhUnw_0lMfHI3c';
  var HDRS = { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY };
  var PAGE = 1000; // PostgREST caps a single response at 1000 rows.

  function get(path) {
    return fetch(URL + '/rest/v1/' + path, { headers: HDRS }).then(function (r) { return r.json(); });
  }

  /* Page through a feed until a short page proves the end. Used for anything
   * whose row count grows without bound (every video ever, every sync day). */
  function getAll(path, offset, acc) {
    offset = offset || 0;
    acc    = acc    || [];
    var sep = path.indexOf('?') === -1 ? '?' : '&';
    return get(path + sep + 'limit=' + PAGE + '&offset=' + offset).then(function (rows) {
      if (!rows || !rows.length) return acc;
      var all = acc.concat(rows);
      return rows.length < PAGE ? all : getAll(path, offset + PAGE, all);
    });
  }

  function fmtShort(n) {
    if (!n) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1000)    return Math.round(n / 1000) + 'K';
    return n.toLocaleString();
  }

  function num(v) { return Number(v) || 0; }

  function sum(rows, key) {
    return rows.reduce(function (s, r) { return s + num(r[key]); }, 0);
  }

  function median(arr) {
    if (!arr.length) return 0;
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function viewBuckets(plays) {
    var defs = [
      { label: '<10K',     min: 0,       max: 10000   },
      { label: '10K-50K',  min: 10000,   max: 50000   },
      { label: '50K-250K', min: 50000,   max: 250000  },
      { label: '250K-1M',  min: 250000,  max: 1000000 },
      { label: '1M+',      min: 1000000, max: Infinity }
    ];
    var total = plays.length || 1;
    return defs.map(function (d) {
      var count = plays.filter(function (v) { return v >= d.min && v < d.max; }).length;
      return { label: d.label, count: count, pct: Math.round(count / total * 1000) / 10 };
    });
  }

  /* An empty platform: the shape every build*() returns, so a creator with no
   * account on a platform (or a feed that has not landed yet) sums to zero
   * instead of poisoning the totals with NaN. */
  function emptyPlatform() {
    return { followers: 0, likes: 0, views: 0, interactions: 0, engViews: 0 };
  }

  /* Display label per platform key. Keyed off the `platforms` map, so adding
   * Instagram means adding one entry here and one in buildCreator. */
  var PLATFORM_LABELS = { tiktok: 'TikTok', youtube: 'YouTube', instagram: 'Instagram' };

  /* "TikTok, YouTube and Instagram" from the creator's actual accounts. Reads
   * `socials` (not the stats map) so a platform they are genuinely on is named
   * even before its feed exists, matching the About "Platforms" tile.
   *
   * @gotcha Ordered by audience, biggest first, NOT by the key order in
   *         config.js: that order is arbitrary and put Instagram (no data at
   *         all) ahead of YouTube. A platform with no feed yet sorts last.
   */
  function platformSentence(socials, platforms) {
    var names = Object.keys(socials || {})
      .sort(function (a, b) {
        var fa = (platforms[a] || {}).followers || -1;
        var fb = (platforms[b] || {}).followers || -1;
        return fb - fa;
      })
      .map(function (k) { return PLATFORM_LABELS[k] || k; });
    if (names.length < 2) return names[0] || '';
    return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }

  /**
   * Substitute {placeholders} in a bio with live figures.
   *
   * @param {string} tpl - bio text from SITE_CONFIG, may contain {followers} etc
   * @param {object} vars - placeholder name to already-formatted value
   * @returns {string} bio with every known placeholder replaced
   *
   * @invariant Bios carry NO hard-coded figures. Mys's once claimed "1.4 million
   *            followers and 54 million likes" and drifted to being wrong by
   *            300K followers and 23M likes, sitting inches under the correct
   *            numbers on the same card. An unknown placeholder is left intact
   *            rather than blanked, so a typo is visible instead of silently
   *            deleting words from a sentence on the public site.
   */
  function fillBio(tpl, vars) {
    return String(tpl || '').replace(/\{(\w+)\}/g, function (whole, key) {
      return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : whole;
    });
  }

  /**
   * The per-platform rows the roster card renders under the combined figures.
   *
   * @param {object} platforms - creator.platforms map
   * @returns {Array<{key:string,label:string,followers:string,views:string,engagementRate:string}>}
   *          biggest audience first; formatted for direct render.
   *
   * @invariant A platform appears only once its audience clears
   *            SITE_CONFIG.rosterCard.minFollowersForPlatformRow (a business
   *            rule, not a data one: a channel too small to sell is noise on a
   *            card whose job is to win brand deals).
   * @gotcha Because small platforms are filtered out, these rows deliberately do
   *         NOT sum to the combined hero figure above them. The card labels the
   *         block so it never claims to be the full picture. Do not "fix" this
   *         by re-deriving the hero from the visible rows: that would throw away
   *         real audience from the number brands read first.
   */
  function platformRows(platforms) {
    var min = (SITE_CONFIG.rosterCard || {}).minFollowersForPlatformRow || 0;
    return Object.keys(platforms)
      .map(function (k) { return { key: k, p: platforms[k] }; })
      .filter(function (e) { return e.p.followers >= min; })
      .sort(function (a, b) { return b.p.followers - a.p.followers; })
      .map(function (e) {
        return {
          key:            e.key,
          label:          PLATFORM_LABELS[e.key] || e.key,
          followers:      fmtShort(e.p.followers),
          views:          fmtShort(e.p.views),
          engagementRate: Math.round((e.p.engViews ? e.p.interactions / e.p.engViews : 0) * 1000) / 10 + '%',
        };
      });
  }

  function fetchVideos() {
    var cols = 'tiktok_username,total_play,total_like,total_comment,total_share,average_time_watched';
    return getAll('tiktok_video_insights_view?select=' + cols);
  }

  function fetchYouTube() {
    var cols = 'account__account_id,report__date,channel_totals__subscribers,channel_totals__views,'
             + 'performance__views,interactions__likes,interactions__comments,interactions__shares';
    return getAll('yt_channel_stats_view?select=' + cols + '&order=report__date.desc');
  }

  /**
   * Roll one creator's YouTube channel into the shared platform shape.
   *
   * @param {object} cfg - SITE_CONFIG.creators[id]
   * @param {Array}  rows - every yt_channel_stats_view row, newest date first
   * @returns {{followers:number,likes:number,views:number,interactions:number,engViews:number,dataAsOf:string}}
   *
   * @gotcha `channel_totals__*` are cumulative lifetime snapshots (take the
   *         latest row); `interactions__*` and `performance__views` are DAILY
   *         deltas (sum them). Mixing the two bases understates any rate built
   *         from them, so engagement pairs the daily interactions with the
   *         daily views (engViews), never with lifetime views.
   * @gotcha The daily feed starts 2026-02-20, so YouTube likes are a floor, not
   *         a true lifetime count. It covers 98%+ of both channels' lifetime
   *         views, so the gap is small, and the About tiles read "+".
   */
  function buildYouTube(cfg, rows) {
    if (!cfg.youtubeAccountId) return emptyPlatform();
    var mine = rows.filter(function (r) { return r.account__account_id === cfg.youtubeAccountId; });
    if (!mine.length) return emptyPlatform();

    /* Newest row carrying a real subscriber count. Mirrors the TikTok
     * skip-the-zero-row guard: a sync that lands mid-write must never render
     * "0 followers" on the public site. */
    var latest = mine.find(function (r) { return num(r.channel_totals__subscribers) > 0; }) || {};

    return {
      followers:    num(latest.channel_totals__subscribers),
      views:        num(latest.channel_totals__views),
      likes:        sum(mine, 'interactions__likes'),
      interactions: sum(mine, 'interactions__likes')
                  + sum(mine, 'interactions__comments')
                  + sum(mine, 'interactions__shares'),
      engViews:     sum(mine, 'performance__views'),
      dataAsOf:     latest.report__date || '',
    };
  }

  function buildCreator(cfg, profiles, videos, genders, countries, ytRows) {
    /* Profile: most recent row with a real follower count. Coupler stamps a
     * zero-follower row at the start of every sync day; falling through to the
     * next row prevents "0 followers" from rendering on the public site. */
    var profile    = profiles.find(function (r) {
      return r.tiktok_username === cfg.tiktokHandle && Number(r.followers_count) > 0;
    }) || {};
    var followers  = Number(profile.followers_count) || 0;
    var latestDate = profile.date || '';

    /* Video aggregates. TikTok rows are per-video LIFETIME counters, so summing
     * them gives a true all-time total (unlike YouTube's daily deltas). */
    var vids        = videos.filter(function (v) { return v.tiktok_username === cfg.tiktokHandle; });
    var plays       = vids.map(function (v) { return Number(v.total_play)  || 0; });
    var totalViews  = plays.reduce(function (s, v) { return s + v; }, 0);
    var totalLikes  = sum(vids, 'total_like');
    var totalShares = sum(vids, 'total_share');
    var totalCmts   = sum(vids, 'total_comment');
    var totalWatch  = sum(vids, 'average_time_watched');
    var avgViews    = vids.length ? Math.round(totalViews  / vids.length) : 0;
    var medViews    = Math.round(median(plays));
    var avgWatch    = vids.length ? totalWatch / vids.length : 0;
    var engRate     = totalViews ? (totalLikes + totalCmts + totalShares) / totalViews : 0;

    /* Gender: most recent date for this creator */
    var cg          = genders.filter(function (r) { return r.tiktok_username === cfg.tiktokHandle; });
    var gDate       = cg.reduce(function (b, r) { return r.date > b ? r.date : b; }, '');
    var gRows       = cg.filter(function (r) { return r.date === gDate; });
    var genderData  = gRows.map(function (r) { return { label: r.gender, value: Math.round(r.percentage * 100) }; });
    var femalePct   = (gRows.find(function (r) { return r.gender === 'Female'; }) || {}).percentage || 0;

    /* Countries: most recent date, top 5, excluding "Others" */
    var cc          = countries.filter(function (r) { return r.tiktok_username === cfg.tiktokHandle; });
    var cDate       = cc.reduce(function (b, r) { return r.date > b ? r.date : b; }, '');
    var cRows       = cc.filter(function (r) { return r.date === cDate && r.country !== 'Others'; })
                       .sort(function (a, b) { return b.percentage - a.percentage; })
                       .slice(0, 5);
    var countryData = cRows.map(function (r) { return { label: r.country, value: Math.round(r.percentage * 1000) / 10 }; });
    var usPct       = (cRows.find(function (r) { return r.country === 'United States'; }) || {}).percentage || 0;

    /* Per-platform rollup. Instagram slots in here as a third entry the day its
     * feed lands; nothing downstream needs to change. */
    var platforms = {
      tiktok: {
        followers:    followers,
        likes:        totalLikes,
        views:        totalViews,
        interactions: totalLikes + totalCmts + totalShares,
        engViews:     totalViews,
      },
      youtube: buildYouTube(cfg, ytRows),
    };
    var all = Object.keys(platforms).map(function (k) { return platforms[k]; });
    var xFollowers = all.reduce(function (s, p) { return s + p.followers;    }, 0);
    var xLikes     = all.reduce(function (s, p) { return s + p.likes;        }, 0);
    var xViews     = all.reduce(function (s, p) { return s + p.views;        }, 0);
    var xInter     = all.reduce(function (s, p) { return s + p.interactions; }, 0);
    var xEngViews  = all.reduce(function (s, p) { return s + p.engViews;     }, 0);
    var xEngRate   = xEngViews ? xInter / xEngViews : 0;

    return {
      id:             cfg.id,
      name:           cfg.name,
      tag:            cfg.tag,
      bio:            fillBio(cfg.bio, {
        followers:      fmtShort(xFollowers),
        likes:          fmtShort(xLikes),
        views:          fmtShort(xViews),
        engagementRate: Math.round(xEngRate * 1000) / 10 + '%',
        platforms:      platformSentence(cfg.socials, platforms),
      }),
      /* Headline figures are cross-platform (see file header). */
      followers:      fmtShort(xFollowers),
      likes:          fmtShort(xLikes),
      engagementRate: Math.round(xEngRate * 1000) / 10 + '%',
      tiktokHandle:   cfg.tiktokHandle,
      photo:          cfg.photo,
      socials:        cfg.socials,
      platforms:      platforms,
      platformRows:   platformRows(platforms),
      totals: {
        followers:      xFollowers,
        likes:          xLikes,
        views:          xViews,
        engagementRate: Math.round(xEngRate * 1000) / 10 / 100,
      },
      tiktokStats: {
        followers:           followers,
        allTimeViews:        totalViews,
        allTimeLikes:        totalLikes,
        allTimeShares:       totalShares,
        allTimeComments:     totalCmts,
        totalVideos:         vids.length,
        avgViewsPerVideo:    avgViews,
        medianViewsPerVideo: medViews,
        avgWatchTimeSec:     Math.round(avgWatch * 100) / 100,
        engagementRate:      Math.round(engRate * 1000) / 10 / 100,
        femaleAudience:      femalePct,
        usAudience:          usPct,
        dataAsOf:            latestDate,
        viewDistribution:    viewBuckets(plays),
      },
      /* Measured audience only. Every field here comes from a live feed.
       *
       * @gotcha There is no `age` bracket and there must not be one until a feed
       *         supplies it. config.js used to carry a hand-typed age
       *         distribution that was byte-identical for both creators, and it
       *         rendered on the creator page, the media kit AND the media-kit
       *         PDF as measured analytics. No age demographic exists anywhere in
       *         the database; neither TikTok nor YouTube supplies one today.
       * @gotcha The old `cfg.audience.*` fallbacks were removed with it: they
       *         named keys config.js never defined, so an empty feed would have
       *         handed `undefined` to the chart builders rather than degrading.
       *         An empty array renders an empty chart, which is the honest
       *         result and what every builder here already handles.
       */
      audience: {
        gender:       genderData,
        topCountries: countryData,
      },
      contentCategories: cfg.contentCategories,
      rateCard:          cfg.rateCard,
    };
  }

  /**
   * Load every public feed and return the site-wide data object.
   *
   * @returns {Promise<{about:object, roster:Array, mediaKit:object}>}
   */
  window.loadSiteData = function () {
    var profileCols  = 'tiktok_username,date,followers_count';
    var genderCols   = 'tiktok_username,date,gender,percentage';
    var countryCols  = 'tiktok_username,date,country,percentage';

    return Promise.all([
      // limit=12 (was 4) gives each creator several days of buffer so the
      // skip-zero-followers filter in buildCreator always finds a real row.
      get('tiktok_profile_insights_view?select=' + profileCols + '&order=date.desc&limit=12'),
      fetchVideos(),
      get('tiktok_audience_gender_view?select='  + genderCols  + '&order=date.desc&limit=12'),
      get('tiktok_audience_country_view?select=' + countryCols + '&order=date.desc&limit=60'),
      fetchYouTube(),
    ]).then(function (res) {
      var profiles  = res[0];
      var videos    = res[1];
      var genders   = res[2];
      var countries = res[3];
      var ytRows    = res[4];

      var roster = ['kym', 'mys'].map(function (id) {
        return buildCreator(SITE_CONFIG.creators[id], profiles, videos, genders, countries, ytRows);
      });

      var totalFollowers = roster.reduce(function (s, c) { return s + c.totals.followers; }, 0);
      var totalLikes     = roster.reduce(function (s, c) { return s + c.totals.likes;     }, 0);
      var totalViews     = roster.reduce(function (s, c) { return s + c.totals.views;     }, 0);
      var femaleAvg      = roster.reduce(function (s, c) { return s + c.tiktokStats.femaleAudience; }, 0) / roster.length;

      /* Platforms tile counts the platforms the roster actually has accounts on
       * (config socials), NOT the feeds we have stats for. Instagram is live for
       * both creators while its Coupler feed is still pending, so counting feeds
       * would quietly drop the tile from 3 to 2. */
      var platformCount = roster.reduce(function (set, c) {
        Object.keys(c.socials || {}).forEach(function (k) { set[k] = true; });
        return set;
      }, {});

      return {
        about: {
          stats: [
            { value: fmtShort(totalFollowers) + '+', label: 'Combined Followers' },
            { value: fmtShort(totalLikes)     + '+', label: 'Combined Likes'     },
            { value: String(Object.keys(platformCount).length), label: 'Platforms' },
            { value: String(roster.length),          label: 'Creators'           },
          ]
        },
        roster: roster,
        mediaKit: {
          rosterOverview: [
            { value: fmtShort(totalFollowers) + '+', label: 'Combined Followers'    },
            { value: fmtShort(totalLikes)     + '+', label: 'Combined Likes'        },
            { value: fmtShort(totalViews)     + '+', label: 'Combined Video Views'  },
            { value: Math.round(femaleAvg * 100) + '%', label: 'Female Audience'   },
          ],
          brandCategories: SITE_CONFIG.mediaKit.brandCategories,
        }
      };
    });
  };
})();
