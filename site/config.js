/**
 * site/config.js - static public-site data that does not come from Supabase.
 *
 * Loaded before supabase-data.js, which reads `creators[id]` to know which feed
 * rows belong to whom: `tiktokHandle` keys the tiktok_* views,
 * `youtubeAccountId` keys yt_channel_stats_view.account__account_id.
 *
 * @gotcha `socials` doubles as the source for the About "Platforms" tile and the
 *         `{platforms}` bio placeholder, so a platform listed here is named and
 *         counted whether or not its stats feed exists.
 * @gotcha Bios must NEVER hard-code a figure. Use the placeholders
 *         `{followers}` `{likes}` `{views}` `{engagementRate}` `{platforms}`,
 *         filled from live data by fillBio() in site/supabase-data.js. A typed
 *         number goes stale silently and ends up contradicting the stats
 *         rendered inches away on the same card.
 */
var SITE_CONFIG = {
  /* Homepage roster card. A platform earns its own stats row only once its
   * audience clears this bar: a channel too small to sell is noise on a card
   * whose job is to win brand deals. Rows therefore do not sum to the combined
   * figure above them, which is why the card labels them "Main platforms". */
  rosterCard: {
    minFollowersForPlatformRow: 50000,
  },
  creators: {
    kym: {
      id: 'kym',
      name: 'Kym',
      tag: 'Content Creator',
      bio: 'Kym is a lifestyle and fashion creator known for her fit checks, authentic wasian perspective, and JROTC content. With a natural presence on camera and a growing audience, she connects with fans through real, relatable storytelling.',
      photo: 'site/kym.jpg',
      tiktokHandle: 'kymchi_n_crackers',
      youtubeAccountId: 'UCr7Xef4lCMrp9OtlkuGCcVw',
      socials: {
        tiktok:    'https://www.tiktok.com/@kymchi_n_crackers',
        instagram: 'https://www.instagram.com/glittery.unicorn.farts/',
        youtube:   'https://www.youtube.com/@ShimmieKymmie'
      },
      contentCategories: ['Fashion', 'Lifestyle', 'Beauty', 'Teenage', 'School', 'College', 'JROTC'],
      rateCard: {
        currency: 'USD',
        packages: [
          {
            id:         'single',
            name:       'Single Post',
            desc:       'One organic TikTok video created, drafted for approval, and posted to the creator\'s account.',
            priceMin:   75,
            priceMax:   125,
            priceFixed: null,
            unit:       'per post'
          },
          {
            id:         'campaign',
            name:       'Campaign Post',
            desc:       '5 posts over an agreed period at a preferred rate. Sustained audience exposure at $80 per post versus the standard single post rate.',
            priceMin:   null,
            priceMax:   null,
            priceFixed: 400,
            unit:       'flat (5 posts, $80 each)'
          }
        ],
        addons: [
          { name: 'Exclusivity',   desc: 'Prevents the creator from posting for directly competing brands for an agreed period.' },
          { name: 'Usage Rights',  desc: 'License to repost or repurpose the content on your own channels and paid media.' },
          { name: 'Spark Code',    desc: 'A TikTok-issued code that lets you boost the organic post as a paid ad directly from the creator\'s account, preserving authentic engagement.' }
        ],
        addonNote: 'All add-ons are priced on request. Contact us with your requirements and we will provide a tailored quote.',
        cpm: {
          medianSingleMin: 4.72,
          medianSingleMax: 7.86,
          campaignPerPost: 5.03,
          note: 'CPM is calculated on median views per post. Actual CPM varies by video. The view distribution chart shows why: high-performing posts deliver significantly lower CPM.',
          viewDistribution: [
            { label: '<10K',     cpm: 20.00 },
            { label: '10K-50K',  cpm: 3.33  },
            { label: '50K-250K', cpm: 0.67  },
            { label: '250K-1M',  cpm: 0.16  },
            { label: '1M+',      cpm: 0.07  }
          ]
        }
      }
    },
    mys: {
      id: 'mys',
      name: 'Mys',
      tag: 'Content Creator',
      bio: 'Mys is a breakout lifestyle and trend creator with over {followers} followers and {likes} likes across {platforms}. Known for her magnetic energy, swag-forward content, and deeply personal storytelling, she has built one of the most engaged young audiences online.',
      photo: 'site/mys.jpg',
      tiktokHandle: 'mysthegreat',
      youtubeAccountId: 'UCXwaen66ayFBKg0atM2PRIg',
      socials: {
        tiktok:    'https://www.tiktok.com/@mysthegreat',
        instagram: 'https://www.instagram.com/therealmysthegreat/',
        youtube:   'https://www.youtube.com/@Mys-The-Great'
      },
      contentCategories: ['Fashion', 'Lifestyle', 'Music', 'Beauty', 'Teenage', 'School', 'Concerts'],
      rateCard: {
        currency: 'USD',
        packages: [
          {
            id:         'single',
            name:       'Single Post',
            desc:       'One organic TikTok video created, drafted for approval, and posted to the creator\'s account.',
            priceMin:   500,
            priceMax:   800,
            priceFixed: null,
            unit:       'per post'
          },
          {
            id:         'campaign',
            name:       'Campaign Post',
            desc:       '5 posts over an agreed period at a preferred rate. Sustained audience exposure at $400 per post versus the standard single post rate.',
            priceMin:   null,
            priceMax:   null,
            priceFixed: 2000,
            unit:       'flat (5 posts, $400 each)'
          }
        ],
        addons: [
          { name: 'Exclusivity',   desc: 'Prevents the creator from posting for directly competing brands for an agreed period.' },
          { name: 'Usage Rights',  desc: 'License to repost or repurpose the content on your own channels and paid media.' },
          { name: 'Spark Code',    desc: 'A TikTok-issued code that lets you boost the organic post as a paid ad directly from the creator\'s account, preserving authentic engagement.' }
        ],
        addonNote: 'All add-ons are priced on request. Contact us with your requirements and we will provide a tailored quote.',
        cpm: {
          medianSingleMin: 1.90,
          medianSingleMax: 3.04,
          campaignPerPost: 1.52,
          note: 'CPM is calculated on median views per post. Actual CPM varies by video. The view distribution chart shows why: high-performing posts deliver significantly lower CPM.',
          viewDistribution: [
            { label: '<10K',     cpm: 130.00 },
            { label: '10K-50K',  cpm: 21.67  },
            { label: '50K-250K', cpm: 4.33   },
            { label: '250K-1M',  cpm: 1.04   },
            { label: '1M+',      cpm: 0.43   }
          ]
        }
      }
    }
  },
  mediaKit: {
    brandCategories: [
      'Music', 'Labels', 'Bands', 'Artists',
      'Beauty', 'Fashion', 'Clothing', 'Accessories',
      'Shoes', 'Apparel', 'Make-Up', 'Lifestyle'
    ]
  }
};
