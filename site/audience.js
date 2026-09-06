/**
 * site/audience.js - the per-platform half of Audience Insights on creator.html.
 *
 * Builds the cards each platform can genuinely answer and nothing else. A platform missing
 * from a card is missing because no feed supplies it, never because the figure was
 * inconvenient, and the card states that absence rather than leaving a gap.
 *
 * Reached only when site/supabase-data.js is called with `withPlatformAudience`, which only
 * creator.html does. index.html and media-kit.html render none of this and must not pay four
 * extra feeds for it.
 *
 * @invariant every figure here is MEASURED, and the absences are as deliberate as the numbers.
 *            No YouTube gender or country data exists in any table. Instagram's two demographic
 *            snapshots disagree with each other (12,232 people against 19,497) and with her
 *            follower count (10,607), and its daily follower feed claims more new followers in
 *            two months than the account has. So Gender Split and Top Countries stay TikTok
 *            only, and growth stays TikTok and YouTube. @see `.claude/rules/public-site.md`
 * @gotcha every rate here is VIEW-WEIGHTED, never a mean of per-row averages. A creator's
 *         median video and her one 40M-view video are not one vote each: an unweighted mean of
 *         `average_time_watched` over 980 videos describes a video nobody watched.
 */
(function () {
  /* Rows to average a rate over. A platform with no views has no rate, and returning 0 would
   * put "0.0s average watch time" on a sales page for a platform we simply cannot measure. */
  function weighted(rows, valueOf, weightOf) {
    var num = 0;
    var den = 0;
    rows.forEach(function (r) {
      var w = Number(weightOf(r)) || 0;
      var v = Number(valueOf(r));
      if (!w || !isFinite(v)) return;
      num += v * w;
      den += w;
    });
    return den ? num / den : null;
  }

  function sum(rows, key) {
    return rows.reduce(function (s, r) { return s + (Number(r[key]) || 0); }, 0);
  }

  function round1(n) { return Math.round(n * 10) / 10; }

  /* A platform earns a place in a card only when the card has something to say about it. */
  function push(list, key, labels, value) {
    if (value === null || value === undefined) return;
    list.push({ key: key, label: labels[key] || key, value: value });
  }

  /**
   * Seconds held per view, per platform. The one figure all three platforms answer the same way.
   *
   * @gotcha YouTube's own `average_view_duration` is used rather than watch time over views.
   *         The two disagree by roughly 1.9x on every day of the feed and nothing in the data
   *         resolves which is right, but the reported figure is at least consistent with the
   *         average view percentage beside it. Publish YouTube's number, never a recomputation
   *         of it: the watch-time column is not granted to the publishable key at all.
   *         @see `schemas/SCHEMA.sql`
   */
  function watchTime(ctx) {
    var out = [];
    push(out, 'tiktok', ctx.labels, weighted(
      ctx.tiktokVideos,
      function (v) { return v.average_time_watched; },
      function (v) { return v.total_play; }
    ));
    push(out, 'youtube', ctx.labels, weighted(
      ctx.ytStats,
      function (r) { return r.performance__average_view_duration__seconds_; },
      function (r) { return r.performance__views; }
    ));
    push(out, 'instagram', ctx.labels, weighted(
      ctx.igPosts.filter(function (p) { return p.reel_avg_view_time_ms != null; }),
      function (p) { return p.reel_avg_view_time_ms / 1000; },
      function (p) { return p.views; }
    ));
    return out.map(function (e) { return { key: e.key, label: e.label, seconds: round1(e.value) }; });
  }

  /**
   * Likes, comments and shares per 1,000 views, per platform.
   *
   * @gotcha Deliberately a RATE, not each type's share of total interactions. The share reads
   *         96% likes on all three platforms for both creators, so three charts would look
   *         identical and say nothing. The rate separates them: Mys draws 135 likes per 1,000
   *         views on TikTok against 66 on YouTube, and Instagram carries more than double
   *         TikTok's share rate, which is the fact a brand is actually buying.
   * @gotcha YouTube pairs DAILY interactions with DAILY `performance__views`, never lifetime
   *         `channel_totals__views`, or the rate collapses. TikTok and Instagram rows are
   *         per-post lifetime counters on both halves, so they pair directly.
   */
  function engagement(ctx) {
    var per1k = function (n, views) { return views ? Math.round(1000 * n / views * 100) / 100 : null; };
    var out = [];
    var build = function (key, likes, comments, shares, views) {
      if (!views) return;
      out.push({
        key: key,
        label: ctx.labels[key] || key,
        rows: [
          { label: 'Likes',    value: per1k(likes, views) },
          { label: 'Comments', value: per1k(comments, views) },
          { label: 'Shares',   value: per1k(shares, views) }
        ]
      });
    };
    build('tiktok',
      sum(ctx.tiktokVideos, 'total_like'), sum(ctx.tiktokVideos, 'total_comment'),
      sum(ctx.tiktokVideos, 'total_share'), sum(ctx.tiktokVideos, 'total_play'));
    build('youtube',
      sum(ctx.ytStats, 'interactions__likes'), sum(ctx.ytStats, 'interactions__comments'),
      sum(ctx.ytStats, 'interactions__shares'), sum(ctx.ytStats, 'performance__views'));
    build('instagram',
      sum(ctx.igPosts, 'likes'), sum(ctx.igPosts, 'comments'),
      sum(ctx.igPosts, 'shares'), sum(ctx.igPosts, 'views'));
    return out;
  }

  /* TikTok's per-video source fractions, in the order a reader cares about. The same five the
   * hub charts, so the two surfaces cannot disagree about what "Profile" means.
   * @see `hub-src/src/components/shared/AnalyticsPage.js` TT_TRAFFIC_SOURCES */
  var TT_SOURCES = [
    { col: 'src_for_you',          label: 'For You' },
    { col: 'src_personal_profile', label: 'Profile' },
    { col: 'src_search',           label: 'Search' },
    { col: 'src_follow',           label: 'Following' },
    { col: 'src_sound',            label: 'Sound' }
  ];

  /* YouTube's source types. YT_CHANNEL is named rather than folded into Other because it is
   * 22.5% of Mys's lifetime views: the hub's own donut drops it into Other, which is survivable
   * on an internal screen and not on the page that sells her. */
  var YT_SOURCES = [
    { key: 'SHORTS',     label: 'Shorts Feed' },
    { key: 'YT_CHANNEL', label: 'Channel Page' },
    { key: 'SUBSCRIBER', label: 'Subscribers' },
    { key: 'YT_SEARCH',  label: 'Search' }
  ];

  /**
   * Where the views came from, for the two platforms that publish it.
   *
   * @gotcha Instagram is absent by omission, not by failure. Its post feed carries reach and
   *         follows but no discovery breakdown of any kind, so there is nothing to chart.
   * @gotcha TikTok's five fractions sum to about 0.99 per video, so "Other" is the honest
   *         remainder rather than a category. `src_hashtag` and `src_other_profile` are null on
   *         every one of the 2,860 rows and are not granted to the publishable key at all.
   */
  function viewSources(ctx) {
    var out = [];
    var plays = sum(ctx.tiktokVideos, 'total_play');
    if (plays) {
      var named = 0;
      var rows = TT_SOURCES.map(function (s) {
        var pct = 100 * weighted(ctx.tiktokVideos,
          function (v) { return v[s.col]; },
          function (v) { return v.total_play; });
        named += pct;
        return { label: s.label, value: round1(pct) };
      });
      rows.push({ label: 'Other', value: round1(Math.max(0, 100 - named)) });
      out.push({ key: 'tiktok', label: ctx.labels.tiktok, rows: rows });
    }

    var ytTotal = sum(ctx.ytTraffic, 'views');
    if (ytTotal) {
      var seen = {};
      var ytRows = YT_SOURCES.map(function (s) {
        seen[s.key] = true;
        var v = ctx.ytTraffic.filter(function (r) { return r.source === s.key; });
        return { label: s.label, value: round1(100 * sum(v, 'views') / ytTotal) };
      });
      var other = ctx.ytTraffic.filter(function (r) { return !seen[r.source]; });
      ytRows.push({ label: 'Other', value: round1(100 * sum(other, 'views') / ytTotal) });
      out.push({ key: 'youtube', label: ctx.labels.youtube, rows: ytRows });
    }
    return out;
  }

  /**
   * Net followers gained over the trailing window, for the two platforms that can say.
   *
   * @param {number} days - the window, so the card's own label and this figure cannot drift.
   *
   * @gotcha Instagram is excluded on purpose and it is the one exclusion that looks like a bug.
   *         `ig_followers_daily` reports 68,177 new followers across 65 days for an account its
   *         own profile feed puts at 10,607 followers. One of those two is wrong, nothing in the
   *         data says which, and a follower count is exactly the figure a brand checks first.
   * @gotcha TikTok's `net_followers` is already a net day-over-day delta, while YouTube reports
   *         gained and lost separately. Summing TikTok's gained against YouTube's gained would
   *         compare a net against a gross and flatter YouTube by every unfollow it ever had.
   */
  function growth(ctx, days) {
    var cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    var out = [];
    var tk = ctx.tiktokProfile.filter(function (r) { return r.date >= cutoff; });
    if (tk.length) {
      out.push({ key: 'tiktok', label: ctx.labels.tiktok, gained: sum(tk, 'net_followers') });
    }
    var yt = ctx.ytSubs.filter(function (r) { return r.date >= cutoff; });
    if (yt.length) {
      out.push({
        key: 'youtube',
        label: ctx.labels.youtube,
        gained: sum(yt, 'gained') - sum(yt, 'lost')
      });
    }
    return out;
  }

  /**
   * How posts spread across view bands, for the two platforms with a per-post feed.
   *
   * @gotcha YouTube is absent because its per-video feed lags the channel feed beside it by
   *         months, and a distribution drawn from stale rows is worse than a missing card. It
   *         returns the day that importer runs current again, with no change needed here.
   */
  function distribution(ctx) {
    var out = [];
    if (ctx.tiktokVideos.length) {
      out.push({
        key: 'tiktok',
        label: ctx.labels.tiktok,
        bands: ctx.viewBuckets(ctx.tiktokVideos.map(function (v) { return Number(v.total_play) || 0; }))
      });
    }
    if (ctx.igPosts.length) {
      out.push({
        key: 'instagram',
        label: ctx.labels.instagram,
        bands: ctx.viewBuckets(ctx.igPosts.map(function (p) { return Number(p.views) || 0; }))
      });
    }
    return out;
  }

  /** Trailing window for the growth card. The card's label reads it, so the two cannot drift. */
  var GROWTH_DAYS = 30;

  window.PLATFORM_AUDIENCE = {
    growthDays: GROWTH_DAYS,

    /**
     * The two feeds only this section needs, fetched with the callers' own helpers so the
     * failure rules (`get` rejects a non-200, `getAll` refuses a non-array) apply here too.
     *
     * @param {function(string): Promise<Array>} get - single-page fetch from supabase-data.js
     * @param {function(string): Promise<Array>} getAll - paging fetch from supabase-data.js
     * @returns {Promise<{ytTraffic: Array, ytSubs: Array}>}
     */
    feeds: function (get, getAll) {
      return Promise.all([
        get('yt_traffic_sources_public_view?select=account_id,source,views'),
        getAll('yt_channel_subscribers_public_view?select=account_id,date,gained,lost')
      ]).then(function (res) {
        return { ytTraffic: res[0], ytSubs: res[1] };
      });
    },

    /**
     * Assemble one creator's per-platform cards out of the whole-roster feeds.
     *
     * @param {object} cfg - `SITE_CONFIG.creators[id]`, whose three account keys select her rows
     * @param {object} labels - the platform key to display name map, owned by supabase-data.js
     * @param {function(Array<number>): Array} viewBuckets - the shared view-band splitter, so
     *        the per-platform card and `tiktokStats.viewDistribution` cannot drift apart
     * @param {object} raw - the roster-wide feeds: videos, profiles, yt, igPosts, ytTraffic,
     *        ytSubs
     * @returns {{watchTime: Array, engagement: Array, viewSources: Array, growth: Array,
     *           viewDistribution: Array}} each an array of platforms that HAVE an answer
     *
     * @gotcha An absent account key matches nothing rather than everything. Kym has no Instagram
     *         rows at all, and a filter on `undefined` that fell through to the full feed would
     *         put Mys's Instagram figures on Kym's page.
     */
    build: function (cfg, labels, viewBuckets, raw) {
      var mine = function (rows, key, want) {
        return want ? rows.filter(function (r) { return r[key] === want; }) : [];
      };
      var ctx = {
        labels:        labels,
        viewBuckets:   viewBuckets,
        tiktokVideos:  mine(raw.videos,    'tiktok_username',    cfg.tiktokHandle),
        tiktokProfile: mine(raw.profiles,  'tiktok_username',    cfg.tiktokHandle),
        ytStats:       mine(raw.yt,        'account__account_id', cfg.youtubeAccountId),
        ytTraffic:     mine(raw.ytTraffic, 'account_id',          cfg.youtubeAccountId),
        ytSubs:        mine(raw.ytSubs,    'account_id',          cfg.youtubeAccountId),
        igPosts:       mine(raw.igPosts,   'instagram_username',  cfg.instagramAccount)
      };
      return {
        watchTime:        watchTime(ctx),
        engagement:       engagement(ctx),
        viewSources:      viewSources(ctx),
        growth:           growth(ctx, GROWTH_DAYS),
        viewDistribution: distribution(ctx)
      };
    }
  };
})();
