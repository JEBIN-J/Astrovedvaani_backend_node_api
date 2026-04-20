const Enums = {
  USER: {
    ROLE: {
      USER: 100,
      ASTROLOGER: 101,
      AI_ASTROLOGER: 102,
      ADMIN: 103,
      VENDOR: 104,
      MODERATOR: 105,
      SUPER_ADMIN: 106,
    },
    LOGIN_METHOD: {
      OTP: 200,
      GOOGLE: 201,
      FACEBOOK: 202,
      PASSWORD: 203,
      APPLE: 204,
    },
    VERIFICATION_STATUS: {
      PENDING: 300,
      APPROVED: 301,
      REJECTED: 302,
      UNDER_REVIEW: 303,
    },
    GENDER: {
      MALE: 1,
      FEMALE: 2,
      OTHER: 3,
    },
    RELATIONSHIP_STATUS: {
      IN_RELATIONSHIP: 10,
      SINGLE: 20,
      MARRIED: 30,
      WIDOWED: 40,
    },
    CHANNEL: {
      GENERAL: 1000,
      PROMOTIONAL: 1001,
      TRANSACTIONAL: 1002,
      WALLET: 1003,
      HOROSCOPE: 1004,
      CONSULTATION: 1005,
      LOGOUT: 1006,
      SUPPORT: 1007,
      RATE_UPDATES: 1008,
    },
    TAGS: {
      LOYAL_CUSTOMER: 350,
      HIGH_SPENDER: 351,
      LOW_BALANCE: 352,
      INACTIVE_USER: 353,
      NEW_USER: 354,
    },
    TAG_SOURCE: {
      SYSTEM: 450,
      ADMIN: 451,
      ML: 452,
    },
  },

  // Services Domain
  SERVICE: {
    TYPE: {
      CHAT: 400,
      VIDEO: 401,
      CALL: 402,
      PALMISTRY: 403,
      REPORT: 404,
      POOJA: 405,
      LIVE: 406,
      WALLET_RECHARGE: 407,
    },
    STATUS: {
      PENDING: 500,
      COMPLETED: 501,
      CANCELLED: 502,
      NO_SHOW: 503,
      ONGOING: 504,
    },
    FOLLOW: {
      PENDING: 505,
      ACCEPTED: 506,
      REJECTED: 507,
    },
  },

  // Payment Domain
  PAYMENT: {
    STATUS: {
      PENDING: 600,
      PAID: 601,
      REFUNDED: 602,
      FAILED: 603,
      CANCELLED: 604,
    },
    METHOD: {
      CREDIT_CARD: 700,
      DEBIT_CARD: 701,
      UPI: 702,
      WALLET: 703,
      NET_BANKING: 704,
    },
    PROVIDER: {
      RAZORPAY: 800,
      PAYTM: 801,
      STRIPE: 802,
      CASHFREE: 803,
      ASTROVEDVANNI: 804,
      PHONEPAY: 805,
    },
  },

  // Transaction Domain
  TRANSACTION: {
    TYPE: {
      RECHARGE: 900,
      REFUND: 901,
      EARNING: 902,
      PURCHASE: 903,
      WITHDRAWAL: 904,
      SESSION: 905,
      POOJA: 906,
    },
    DIRECTION: {
      CREDIT: 1000,
      DEBIT: 1001,
    },
  },
  TAX: {
    CONTEXT: {
      WALLET: 8000,
      PRODUCT: 8100,
    },
  },
  // Communication Domain
  COMMUNICATION: {
    MESSAGE_TYPE: {
      TEXT: 1100,
      IMAGE: 1101,
      VIDEO: 1102,
      AUDIO: 1103,
      DOCUMENT: 1104,
    },
    MESSAGE_STATUS: {
      SENT: 1200,
      DELIVERED: 1201,
      READ: 1202,
      FAILED: 1203,
    },
    CHANNEL: {
      MESSAGE: 1210,
    },
  },

  // Order Domain
  ORDER: {
    TYPE: {
      PRODUCT: 1300,
      POOJA: 1301,
      SERVICE: 1302,
    },
    STATUS: {
      PLACED: 1400,
      PROCESSING: 1401,
      SHIPPED: 1402,
      DELIVERED: 1403,
      CANCELLED: 1404,
      PENDING: 1405,
      COMPLETED: 1406,
    },
  },

  // Support Domain
  SUPPORT: {
    TICKET_STATUS: {
      OPEN: 1500,
      IN_PROGRESS: 1501,
      RESOLVED: 1502,
      CLOSED: 1503,
    },
    PRIORITY: {
      LOW: 1600,
      MEDIUM: 1601,
      HIGH: 1602,
      CRITICAL: 1603,
    },
    CATEGORY: {
      PRODUCT: 1604,
      POOJA: 1605,
      SESSION: 1606,
      OTHER: 1607,
    },
    RELATED_TO: {
      PRODUCT: "product",
      POOJA: "pooja",
      SESSION: "session",
      ORDER: "order",
      USER: "user",
    },
  },
  //
  REFERRAL: {
    REWARD_TYPE: {
      REFERRER: 1700, // Reward for person who referred someone
      REFERRED: 1701, // Reward for person who was referred
      SIGNUP_BONUS: 1702, // Special signup bonus
      WELCOME_BONUS: 1703, // Welcome bonus for new users
    },
    REWARD_STATUS: {
      PENDING: 1800,
      APPROVED: 1801,
      CANCELLED: 1802,
      PROCESSED: 1803,
    },
  },
  NOTIFICATION: {
    NOTIFICATION_TYPE: {
      CHAT: 1900,
      CONSULTATION_REQUEST: 1901,
      CONSULTATION_ACCEPTED: 1902,
      CONSULTATION_REJECTED: 1903,
      PAYMENT_SUCCESS: 1904,
      PAYMENT_FAILED: 1905,
      SYSTEM_ALERT: 1906,
      ADMIN_MESSAGE: 1907,
      POOJA_BOOKING: 1908,
      POOJA_CANCEL: 1909,
      ORDER_RECIEVED: 1911,
      ORDER_CANCEL: 1912,
      CONSULTATION: 1913,
      PRODUCT_BOOKING: 1914,
    },
    NOTIFICATION_STATUS: {
      UNREAD: 2001,
      READ: 2002,
      ARCHIVED: 2003,
    },
  },

  PRODUCT: {
    MEDIA_TYPE: {
      IMAGE: 3001,
      VIDEO: 3002,
      DOCUMENT: 3003,
    },
  },

  // Integration Domain
  INTEGRATION: {
    TYPE: {
      SMS: 4000,
      EMAIL: 4001,
      PAYMENT: 4002,
      ASTROLOGY: 4003,
      OTHER: 4004,
      OAUTH: 4005,
      CALL: 4006,
      SHIPPING: 4007,
      APP_OAUTH: 4008,
      WHATSAPP: 4009,
    },
    PROVIDER: {
      TWILIO: 4100,
      FAST2SMS: 4101,
      SENDGRID: 4102,
      MAILGUN: 4103,
      RAZORPAY: 4104,
      PAYTM: 4105,
      STRIPE: 4106,
      VEDICASTROAPI: 4107,
      ASTRO_API: 4108,
      CUSTOM: 4109,
      GOOGLE: 4110,
      FACEBOOK: 4111,
      APPLE: 4112,
      AGORA: 4113,
      PHONEPAY: 4114,
      SHIPROCKET: 4115,
      DELHIVERY: 4116,
      BLUEDART: 4117,
      AMAZESMS: 4118,
      WHATSAPP: 4119,
    },
  },

  ADDRESS: {
    TYPE: {
      HOME: 5000,
      OFFICE: 5100,
      CITY: 5200,
    },
  },

  SPECIALIZATION: {
    RELATED_TO: {
      DOMAIN: 6000,
      EXPERTISE: 6100,
    },
  },

  STATIC_PAGE: {
    TYPE: {
      PRIVACY_POLICY: 6000,
      TERMS_CONDITIONS: 6100,
      SUPPORT: 6200,
      CONTACT_US: 6300,
      TESTIMONIAL: 6400,
      REFUND_POLICY: 6500,
      ABOUT_US: 6600,
      ASTROLOGERS_PRIVACY_POLICY: 6700,
      ASTROLOGERS_TERMS_CONDITIONS: 6800,
      ASTROLOGERS_REFUND_POLICY: 6900,
      GRIEVANCE_POLICY: 7000,
      SHIPPING_POLICY: 7100,
    },
    CONTENT_TYPE: {
      JSON: 6300,
      FILE: 6400,
    },
  },
  ENTITY: {
    TYPE: {
      PRODUCT: 7000,
      SESSION: 7100,
      POOJA: 7200,
      ORDER: 7300,
      COMMON: 7400,
    },
  },
  SESSION_INTERVAL: {
    LIFETIME: 7400,
    WEEKLY: 7500,
    MONTHLY: 7600,
    YEARLY: 7700,
    DAILY: 7800,
  },
  MEDIA_CONTENT: {
    MEDIA_TYPE: {
      VIDEO: 8700,
      SONG: 8701,
    },
  },
  BANNER_TYPE: {
    POOJA_PAGE: 8000,
    PRODUCT_PAGE: 8100,
    ASTROLOGER_LISTING_PAGE: 8200,
    BLOG_PAGE: 8300,
  },
  GENERAL: {
    CATEGORY: {
      RELATED_TO: {
        BLOG: 9000,
        NEWS: 9100,
      },
    },
  },

  ASTROLOGY: {
    CATEGORY: {
      RELATIONSHIP: 1000,
      VEDIC: 1001,
      ZODIAC: 1002,
      NAKSHATRA: 1003,
      MAHURAT: 1004,
      PALMISTRY: 1005,
      PLANET: 1006,
      NUMEROLOGY: 1007,
      REMEDIES: 1008,
      TAROT: 1009,
    },
  },
};

Object.freeze(Enums);

module.exports = Enums;
