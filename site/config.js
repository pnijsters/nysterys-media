/* config.js: static site data that does not come from Supabase */
var SITE_CONFIG = {
  creators: {
    kym: {
      id: 'kym',
      name: 'Kym',
      tag: 'Content Creator',
      bio: 'Kym is a lifestyle and fashion creator known for her fit checks, authentic wasian perspective, and JROTC content. With a natural presence on camera and a growing audience, she connects with fans through real, relatable storytelling.',
      photo: 'site/kym.jpg',
      tiktokHandle: 'kymchi_n_crackers',
      socials: {
        tiktok:    'https://www.tiktok.com/@kymchi_n_crackers',
        instagram: 'https://www.instagram.com/glittery.unicorn.farts/',
        youtube:   'https://www.youtube.com/@ShimmieKymmie'
      },
      contentCategories: ['Fashion', 'Lifestyle', 'Beauty', 'Teenage', 'School', 'College', 'JROTC'],
      audience: {
        age: [
          { label: '18-24', value: 40.5 },
          { label: '25-34', value: 26.3 },
          { label: '35-44', value: 18.3 },
          { label: '45-54', value: 9.9  },
          { label: '55+',   value: 5.0  }
        ]
      },
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
      bio: 'Mys is a breakout lifestyle and trend creator with over 1.4 million followers and 54 million likes on TikTok. Known for her magnetic energy, swag-forward content, and deeply personal storytelling, she has built one of the most engaged young audiences on the platform.',
      photo: 'site/mys.jpg',
      tiktokHandle: 'mysthegreat',
      socials: {
        tiktok:    'https://www.tiktok.com/@mysthegreat',
        instagram: 'https://www.instagram.com/therealmysthegreat/',
        youtube:   'https://www.youtube.com/@Mys-The-Great'
      },
      contentCategories: ['Fashion', 'Lifestyle', 'Music', 'Beauty', 'Teenage', 'School', 'Concerts'],
      audience: {
        age: [
          { label: '18-24', value: 40.5 },
          { label: '25-34', value: 26.3 },
          { label: '35-44', value: 18.3 },
          { label: '45-54', value: 9.9  },
          { label: '55+',   value: 5.0  }
        ]
      },
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
