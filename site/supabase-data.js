/* supabase-data.js — fetches live creator stats from Supabase and returns
   the same data shape the pages previously read from data.json.
   Requires config.js to be loaded first (SITE_CONFIG). */
(function () {
  var URL  = 'https://rnntuxabccnphfvvvaks.supabase.co';
  var KEY  = 'sb_publishable_uTUIIpWaYYgke_5rtyhUnw_0lMfHI3c';
  var HDRS = { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY };

  function get(path) {
    return fetch(URL + '/rest/v1/' + path, { headers: HDRS }).then(function (r) { return r.json(); });
  }

  function fmtShort(n) {
    if (!n) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1000)    return Math.round(n / 1000) + 'K';
    return n.toLocaleString();
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

  /* Fetch all videos — Supabase caps at 1000 rows per request so page in parallel. */
  function fetchVideos() {
    var cols = 'tiktok_username,total_play,total_like,total_comment,total_share,average_time_watched';
    var pg   = function (off) {
      return get('tiktok_video_insights_view?select=' + cols + '&limit=1000&offset=' + off);
    };
    return pg(0).then(function (p1) {
      if (p1.length < 1000) return p1;
      return Promise.all([pg(1000), pg(2000)]).then(function (rest) {
        return p1.concat(rest[0]).concat(rest[1]);
      });
    });
  }

  function buildCreator(cfg, profiles, videos, genders, countries) {
    /* Profile — most recent row with a real follower count. Coupler stamps a
     * zero-follower row at the start of every sync day; falling through to the
     * next row prevents "0 followers" from rendering on the public site. */
    var profile    = profiles.find(function (r) {
      return r.tiktok_username === cfg.tiktokHandle && Number(r.followers_count) > 0;
    }) || {};
    var followers  = Number(profile.followers_count) || 0;
    var latestDate = profile.date || '';

    /* Video aggregates */
    var vids        = videos.filter(function (v) { return v.tiktok_username === cfg.tiktokHandle; });
    var plays       = vids.map(function (v) { return Number(v.total_play)  || 0; });
    var totalViews  = plays.reduce(function (s, v) { return s + v; }, 0);
    var totalLikes  = vids.reduce(function (s, v) { return s + (Number(v.total_like)    || 0); }, 0);
    var totalShares = vids.reduce(function (s, v) { return s + (Number(v.total_share)   || 0); }, 0);
    var totalCmts   = vids.reduce(function (s, v) { return s + (Number(v.total_comment) || 0); }, 0);
    var totalWatch  = vids.reduce(function (s, v) { return s + (Number(v.average_time_watched) || 0); }, 0);
    var avgViews    = vids.length ? Math.round(totalViews  / vids.length) : 0;
    var medViews    = Math.round(median(plays));
    var avgWatch    = vids.length ? totalWatch / vids.length : 0;
    var engRate     = totalViews ? (totalLikes + totalCmts + totalShares) / totalViews : 0;

    /* Gender — most recent date for this creator */
    var cg          = genders.filter(function (r) { return r.tiktok_username === cfg.tiktokHandle; });
    var gDate       = cg.reduce(function (b, r) { return r.date > b ? r.date : b; }, '');
    var gRows       = cg.filter(function (r) { return r.date === gDate; });
    var genderData  = gRows.map(function (r) { return { label: r.gender, value: Math.round(r.percentage * 100) }; });
    var femalePct   = (gRows.find(function (r) { return r.gender === 'Female'; }) || {}).percentage || 0;

    /* Countries — most recent date, top 5, excluding "Others" */
    var cc          = countries.filter(function (r) { return r.tiktok_username === cfg.tiktokHandle; });
    var cDate       = cc.reduce(function (b, r) { return r.date > b ? r.date : b; }, '');
    var cRows       = cc.filter(function (r) { return r.date === cDate && r.country !== 'Others'; })
                       .sort(function (a, b) { return b.percentage - a.percentage; })
                       .slice(0, 5);
    var countryData = cRows.map(function (r) { return { label: r.country, value: Math.round(r.percentage * 1000) / 10 }; });
    var usPct       = (cRows.find(function (r) { return r.country === 'United States'; }) || {}).percentage || 0;

    return {
      id:             cfg.id,
      name:           cfg.name,
      tag:            cfg.tag,
      bio:            cfg.bio,
      followers:      fmtShort(followers),
      likes:          fmtShort(totalLikes),
      engagementRate: Math.round(engRate * 1000) / 10 + '%',
      tiktokHandle:   cfg.tiktokHandle,
      photo:          cfg.photo,
      socials:        cfg.socials,
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
      audience: {
        gender:       genderData.length ? genderData : cfg.audience.gender,
        age:          cfg.audience.age,
        topCountries: countryData.length ? countryData : cfg.audience.topCountries,
      },
      contentCategories: cfg.contentCategories,
      rateCard:          cfg.rateCard,
    };
  }

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
    ]).then(function (res) {
      var profiles  = res[0];
      var videos    = res[1];
      var genders   = res[2];
      var countries = res[3];

      var roster = ['kym', 'mys'].map(function (id) {
        return buildCreator(SITE_CONFIG.creators[id], profiles, videos, genders, countries);
      });

      var totalFollowers = roster.reduce(function (s, c) { return s + c.tiktokStats.followers; },    0);
      var totalLikes     = roster.reduce(function (s, c) { return s + c.tiktokStats.allTimeLikes; }, 0);
      var totalViews     = roster.reduce(function (s, c) { return s + c.tiktokStats.allTimeViews; }, 0);
      var femaleAvg      = roster.reduce(function (s, c) { return s + c.tiktokStats.femaleAudience; }, 0) / roster.length;

      return {
        about: {
          stats: [
            { value: fmtShort(totalFollowers) + '+', label: 'Combined Followers' },
            { value: fmtShort(totalLikes)     + '+', label: 'Combined Likes'     },
            { value: '3',                            label: 'Platforms'          },
            { value: '2',                            label: 'Creators'           },
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
