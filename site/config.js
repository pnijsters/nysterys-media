/**
 * site/config.js - static public-site data that does not come from Supabase.
 *
 * Loaded before supabase-data.js, which reads `creators[id]` to know which feed
 * rows belong to whom: `tiktokHandle` keys the tiktok_* views,
 * `youtubeAccountId` keys yt_channel_stats_view.account__account_id, and
 * `instagramAccount` keys the ig_* views on `instagram_username`.
 *
 * @gotcha An account key may name a feed that does not exist yet. Kym's
 *         Instagram importers have not been run, so her `instagramAccount`
 *         matches no rows and buildInstagram returns an empty platform. That is
 *         the designed behaviour: the key goes in once, and her figures appear
 *         the day the importer runs, with no code change.
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
      instagramAccount: 'glittery.unicorn.farts',
      socials: {
        tiktok:    'https://www.tiktok.com/@kymchi_n_crackers',
        instagram: 'https://www.instagram.com/glittery.unicorn.farts/',
        youtube:   'https://www.youtube.com/@ShimmieKymmie'
      },
      contentCategories: ['Fashion', 'Lifestyle', 'Beauty', 'Teenage', 'School', 'College', 'JROTC']
    },
    mys: {
      id: 'mys',
      name: 'Mys',
      tag: 'Content Creator',
      bio: 'Mys is a breakout lifestyle and trend creator with over {followers} followers and {likes} likes across {platforms}. Known for her magnetic energy, swag-forward content, and deeply personal storytelling, she has built one of the most engaged young audiences online.',
      photo: 'site/mys.jpg',
      tiktokHandle: 'mysthegreat',
      youtubeAccountId: 'UCXwaen66ayFBKg0atM2PRIg',
      instagramAccount: 'therealmysthegreat',
      socials: {
        tiktok:    'https://www.tiktok.com/@mysthegreat',
        instagram: 'https://www.instagram.com/therealmysthegreat/',
        youtube:   'https://www.youtube.com/@Mys-The-Great'
      },
      contentCategories: ['Fashion', 'Lifestyle', 'Music', 'Beauty', 'Teenage', 'School', 'Concerts'],
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
