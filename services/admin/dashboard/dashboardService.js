const User = require("../../../models/User");
const Astrologer = require("../../../models/Astrologer");
const Product = require("../../../models/Product");
const Order = require("../../../models/Order");
const Wallet = require("../../../models/Wallet");
const ConsultationSession = require("../../../models/ConsultationSession");
const LiveSession = require("../../../models/LiveSession");
const Enums = require("../../../utils/constants");
const { getActiveCountByRole } = require("./accountActivityService");
const { getProductStats } = require("./productStatsService");
const { getConsultationSummary, getLiveSummary } = require("./sessionService");
const Ledger = require("../../../models/Ledger");
const PoojaBooking = require("../../../models/PoojaBooking");
const round2 = (n) => Number((n || 0).toFixed(2));

const getDateRanges = () => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const lastWeekStart = new Date(todayStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  const lastMonthStart = new Date(todayStart);
  lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);

  return { todayStart, yesterdayStart, lastWeekStart, lastMonthStart };
};


exports.getOverview = async () => {
  const dbCounts = await getDbCounts();
  const activeCounts = await getActiveCounts();
  return buildOverviewResponse(dbCounts, activeCounts);
};
async function getDbCounts() {
  const [
    totalUsers,
    totalAstrologers,
    totalVendors,
    newUsers,
    newAstrologers,
    newVendors,
    productStats,
  ] = await Promise.all([
    User.countDocuments({ role: Enums.USER.ROLE.USER, isDeleted: false }),
    User.countDocuments({ role: Enums.USER.ROLE.ASTROLOGER, isDeleted: false }),
    User.countDocuments({ role: Enums.USER.ROLE.VENDOR, isDeleted: false }),

    User.countDocuments({ role: Enums.USER.ROLE.USER, isNewUser: true, isDeleted: false }),
    User.countDocuments({ role: Enums.USER.ROLE.ASTROLOGER, isNewUser: true, isDeleted: false }),
    User.countDocuments({ role: Enums.USER.ROLE.VENDOR, isNewUser: true, isDeleted: false }),

    getProductStats(),
  ]);

  return {
    users: { total: totalUsers, new: newUsers },
    astrologers: { total: totalAstrologers, new: newAstrologers },
    vendors: { total: totalVendors, new: newVendors },
    products: productStats,
  };
}
async function getActiveCounts() {
  const [
    activeUsersRedis,
    activeAstrosRedis,
    activeVendorsRedis,
  ] = await Promise.all([
    getActiveCountByRole(Enums.USER.ROLE.USER),
    getActiveCountByRole(Enums.USER.ROLE.ASTROLOGER),
    getActiveCountByRole(Enums.USER.ROLE.VENDOR),
  ]);

  console.log("Active counts from Redis:", {
    users: activeUsersRedis,
    astrologers: activeAstrosRedis,
    vendors: activeVendorsRedis,
  });

  const activeUsers =
    activeUsersRedis !== null
      ? activeUsersRedis
      : await User.countDocuments({
          role: Enums.USER.ROLE.USER,
          isActive: true,
        });

  const activeAstrologers =
    activeAstrosRedis !== null
      ? activeAstrosRedis
      : await User.countDocuments({
          role: Enums.USER.ROLE.ASTROLOGER,
          isActive: true,
        });

  const activeVendors =
    activeVendorsRedis !== null
      ? activeVendorsRedis
      : await User.countDocuments({
          role: Enums.USER.ROLE.VENDOR,
          isActive: true,
        });

  return {
    users: activeUsers,
    astrologers: activeAstrologers,
    vendors: activeVendors,
  };
}
function buildOverviewResponse(db, active) {
  return {
    users: {
      total: db.users.total,
      active: active.users,
      inactive: db.users.total - active.users,
      new: db.users.new,
    },
    astrologers: {
      total: db.astrologers.total,
      active: active.astrologers,
      inactive: db.astrologers.total - active.astrologers,
      new: db.astrologers.new,
    },
    vendors: {
      total: db.vendors.total,
      active: active.vendors,
      inactive: db.vendors.total - active.vendors,
      new: db.vendors.new,
    },
    products: {
      total: db.products.total,
      recent: db.products.recent,
    },
  };
}

exports.getCommunicationSummary = async () => {
  const [consultations, live] = await Promise.all([
    getConsultationSummary(),
    getLiveSummary(),
  ]);

  const emptyComm = {
    total: 0,
    completed: 0,
    pending: 0,
    rejected: 0,
    total_minutes: 0,
  };

  return {
    communication: {
      chat: {
        type: Enums.SERVICE.TYPE.CHAT,
        ...(consultations[Enums.SERVICE.TYPE.CHAT] || emptyComm),
      },
      call: {
        type: Enums.SERVICE.TYPE.CALL,
        ...(consultations[Enums.SERVICE.TYPE.CALL] || emptyComm),
      },
      video: {
        type: Enums.SERVICE.TYPE.VIDEO,
        ...(consultations[Enums.SERVICE.TYPE.VIDEO] || emptyComm),
      },
      live: {
        type: Enums.SERVICE.TYPE.LIVE,
        ...live,
      },
    },
  };
};
const getSessionEarnings = async ({
  todayStart,
  yesterdayStart,
  lastWeekStart,
  lastMonthStart,
}) => {
  const { CHAT, VIDEO, CALL } = Enums.SERVICE.TYPE;
  const { COMPLETED } = Enums.SERVICE.STATUS;

  const data = await ConsultationSession.aggregate([
    {
      $match: {
        status: COMPLETED,
        mode: { $in: [CHAT, VIDEO, CALL] },
      },
    },
    {
      $addFields: {
        admin_amount: {
          $subtract: ["$total_amount", "$astrologer_share_amount"],
        },
      },
    },
    {
      $facet: {
        total: [{ $group: { _id: "$mode", total: { $sum: "$admin_amount" } } }],
        today: [
          { $match: { createdAt: { $gte: todayStart } } },
          { $group: { _id: "$mode", total: { $sum: "$admin_amount" } } },
        ],
        yesterday: [
          { $match: { createdAt: { $gte: yesterdayStart, $lt: todayStart } } },
          { $group: { _id: "$mode", total: { $sum: "$admin_amount" } } },
        ],
        lastWeek: [
          { $match: { createdAt: { $gte: lastWeekStart } } },
          { $group: { _id: "$mode", total: { $sum: "$admin_amount" } } },
        ],
        lastMonth: [
          { $match: { createdAt: { $gte: lastMonthStart } } },
          { $group: { _id: "$mode", total: { $sum: "$admin_amount" } } },
        ],
      },
    },
  ]);

  const map = (arr) =>
    arr.reduce((acc, d) => {
      acc[d._id] = round2(d.total);
      return acc;
    }, {});

  const s = data[0];

  const build = (mode) => ({
    total: round2(map(s.total)[mode]),
    today: round2(map(s.today)[mode]),
    yesterday: round2(map(s.yesterday)[mode]),
    lastWeek: round2(map(s.lastWeek)[mode]),
    lastMonth: round2(map(s.lastMonth)[mode]),
  });

  return {
    CHAT: build(CHAT),
    VIDEO: build(VIDEO),
    CALL: build(CALL),
  };
};
const getLiveEarnings = async ({
  todayStart,
  yesterdayStart,
  lastWeekStart,
  lastMonthStart,
}) => {
  const agg = await Ledger.aggregate([
    {
      $match: {
        transaction_type: Enums.TRANSACTION.TYPE.EARNING,
        direction: Enums.TRANSACTION.DIRECTION.CREDIT,
        remarks: { $regex: /Gift commission/i },
      },
    },
    {
      $facet: {
        total: [{ $group: { _id: null, total: { $sum: "$final_amount" } } }],
        today: [
          { $match: { timestamp: { $gte: todayStart } } },
          { $group: { _id: null, total: { $sum: "$final_amount" } } },
        ],
        yesterday: [
          { $match: { timestamp: { $gte: yesterdayStart, $lt: todayStart } } },
          { $group: { _id: null, total: { $sum: "$final_amount" } } },
        ],
        lastWeek: [
          { $match: { timestamp: { $gte: lastWeekStart } } },
          { $group: { _id: null, total: { $sum: "$final_amount" } } },
        ],
        lastMonth: [
          { $match: { timestamp: { $gte: lastMonthStart } } },
          { $group: { _id: null, total: { $sum: "$final_amount" } } },
        ],
      },
    },
  ]);

  const g = agg[0];

  return {
    total: round2(g?.total?.[0]?.total),
    today: round2(g?.today?.[0]?.total),
    yesterday: round2(g?.yesterday?.[0]?.total),
    lastWeek: round2(g?.lastWeek?.[0]?.total),
    lastMonth: round2(g?.lastMonth?.[0]?.total),
  };
};
const getPoojaEarnings = async ({
  todayStart,
  yesterdayStart,
  lastWeekStart,
  lastMonthStart,
}) => {
  const { PENDING, COMPLETED, CANCELLED } = Enums.ORDER.STATUS;

  const { PAID } = Enums.PAYMENT.STATUS;

  const agg = await PoojaBooking.aggregate([
    {
      $match: {
        payment_status: PAID,
        booking_status: { $in: [PENDING, COMPLETED] },
      },
    },
    {
      $addFields: {
        admin_amount: {
          $cond: [
            { $eq: ["$booking_status", COMPLETED] },
            {
              $subtract: [
                "$price_snapshot.final_price",
                { $ifNull: ["$astrologer_share_amount", 0] },
              ],
            },
            "$price_snapshot.final_price",
          ],
        },
      },
    },
    {
      $facet: {
        total: [{ $group: { _id: null, total: { $sum: "$admin_amount" } } }],
        today: [
          { $match: { createdAt: { $gte: todayStart } } },
          { $group: { _id: null, total: { $sum: "$admin_amount" } } },
        ],
        yesterday: [
          {
            $match: {
              createdAt: { $gte: yesterdayStart, $lt: todayStart },
            },
          },
          { $group: { _id: null, total: { $sum: "$admin_amount" } } },
        ],
        lastWeek: [
          { $match: { createdAt: { $gte: lastWeekStart } } },
          { $group: { _id: null, total: { $sum: "$admin_amount" } } },
        ],
        lastMonth: [
          { $match: { createdAt: { $gte: lastMonthStart } } },
          { $group: { _id: null, total: { $sum: "$admin_amount" } } },
        ],
      },
    },
  ]);

  const p = agg[0];

  return {
    total: round2(p?.total?.[0]?.total),
    today: round2(p?.today?.[0]?.total),
    yesterday: round2(p?.yesterday?.[0]?.total),
    lastWeek: round2(p?.lastWeek?.[0]?.total),
    lastMonth: round2(p?.lastMonth?.[0]?.total),
  };
};
const getProductEarnings = async ({
  todayStart,
  yesterdayStart,
  lastWeekStart,
  lastMonthStart,
}) => {
  const { PRODUCT } = Enums.ORDER.TYPE;
  const { PAID } = Enums.PAYMENT.STATUS;

  const agg = await Order.aggregate([
    {
      $match: {
        order_type: PRODUCT,
        payment_status: PAID,
      },
    },
    {
      $facet: {
        total: [{ $group: { _id: null, total: { $sum: "$total_payable" } } }],
        today: [
          { $match: { createdAt: { $gte: todayStart } } },
          { $group: { _id: null, total: { $sum: "$total_payable" } } },
        ],
        yesterday: [
          {
            $match: {
              createdAt: { $gte: yesterdayStart, $lt: todayStart },
            },
          },
          { $group: { _id: null, total: { $sum: "$total_payable" } } },
        ],
        lastWeek: [
          { $match: { createdAt: { $gte: lastWeekStart } } },
          { $group: { _id: null, total: { $sum: "$total_payable" } } },
        ],
        lastMonth: [
          { $match: { createdAt: { $gte: lastMonthStart } } },
          { $group: { _id: null, total: { $sum: "$total_payable" } } },
        ],
      },
    },
  ]);

  const p = agg[0];

  return {
    total: round2(p?.total?.[0]?.total),
    today: round2(p?.today?.[0]?.total),
    yesterday: round2(p?.yesterday?.[0]?.total),
    lastWeek: round2(p?.lastWeek?.[0]?.total),
    lastMonth: round2(p?.lastMonth?.[0]?.total),
  };
};

exports.getEarnings = async () => {
  const dates = getDateRanges();

  const session = await getSessionEarnings(dates);
  const live = await getLiveEarnings(dates);
  const pooja = await getPoojaEarnings(dates);
  const product = await getProductEarnings(dates);
  const byService = {
    ...session,
    LIVE: live,
    POOJA: pooja,
    PRODUCT: product,
  };

  const sumAll = (key) =>
    round2(Object.values(byService).reduce((s, v) => s + (v[key] || 0), 0));

  return {
    summary: {
      total: sumAll("total"),
      today: sumAll("today"),
      yesterday: sumAll("yesterday"),
      lastWeek: sumAll("lastWeek"),
      lastMonth: sumAll("lastMonth"),
    },
    byService,
  };
};

const getDateRangesB = () => {
  const now = new Date();

  // Convert to IST start of day → then to UTC
  const startOfDayIST = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
  );
  startOfDayIST.setHours(0, 0, 0, 0);

  // Convert IST start to UTC
  const todayStart = new Date(startOfDayIST.getTime() - (5.5 * 60 * 60 * 1000));

  return {
    todayStart,

    yesterdayStart: new Date(todayStart.getTime() - 1 * 86400000),

    lastWeekStart: new Date(todayStart.getTime() - 7 * 86400000),

    lastMonthStart: new Date(
      new Date(todayStart).setMonth(todayStart.getMonth() - 1)
    ),

    last6MonthStart: new Date(
      new Date(todayStart).setMonth(todayStart.getMonth() - 6)
    ),

    lastYearStart: new Date(
      new Date(todayStart).setFullYear(todayStart.getFullYear() - 1)
    ),
  };
};
const getCurrentBalance = async () => {
  const r = await Wallet.aggregate([
    {
      $lookup: {
        from: "users",
        localField: "user_id",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },
    {
      $match: {
        "user.role": Enums.USER.ROLE.USER,
        "user.isDeleted": false,
        "user.isBlock": false,
      },
    },
    {
      $group: {
        _id: null,
        balance: { $sum: "$balance" },
      },
    },
  ]);

  return Number((r[0]?.balance || 0).toFixed(2));
};
const getRechargeSummary = async () => {
  const {
    todayStart,
    yesterdayStart,
    lastWeekStart,
    lastMonthStart,
    last6MonthStart,
    lastYearStart,
  } = getDateRangesB();

  const tomorrowStart = new Date(todayStart.getTime() + 86400000);

  const agg = await Ledger.aggregate([
    {
      $lookup: {
        from: "wallets",
        localField: "wallet_id",
        foreignField: "_id",
        as: "wallet",
      },
    },
    { $unwind: "$wallet" },

    {
      $lookup: {
        from: "users",
        localField: "wallet.user_id",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },

    {
      $match: {
        transaction_type: Enums.TRANSACTION.TYPE.RECHARGE,
        direction: Enums.TRANSACTION.DIRECTION.CREDIT,
        payment_status: Enums.PAYMENT.STATUS.PAID,
        amount: { $gt: 0 },

        "user.role": Enums.USER.ROLE.USER,
        "user.isDeleted": false,
        "user.isBlock": false,
      },
    },

    {
      $facet: {
        lifetime: [
          { $group: { _id: null, amount: { $sum: "$amount" } } },
        ],

        lastYear: [
          { $match: { timestamp: { $gte: lastYearStart } } },
          { $group: { _id: null, amount: { $sum: "$amount" } } },
        ],

        last6Month: [
          { $match: { timestamp: { $gte: last6MonthStart } } },
          { $group: { _id: null, amount: { $sum: "$amount" } } },
        ],

        lastMonth: [
          { $match: { timestamp: { $gte: lastMonthStart } } },
          { $group: { _id: null, amount: { $sum: "$amount" } } },
        ],

        lastWeek: [
          { $match: { timestamp: { $gte: lastWeekStart } } },
          { $group: { _id: null, amount: { $sum: "$amount" } } },
        ],

        yesterday: [
          {
            $match: {
              timestamp: { $gte: yesterdayStart, $lt: todayStart },
            },
          },
          { $group: { _id: null, amount: { $sum: "$amount" } } },
        ],

        today: [
          {
            $match: {
              timestamp: { $gte: todayStart, $lt: tomorrowStart },
            },
          },
          { $group: { _id: null, amount: { $sum: "$amount" } } },
        ],

        frequent: [
          { $group: { _id: "$amount", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 1 },
        ],
      },
    },
  ]);

  const d = agg[0] || {};

  return {
    lifetime: Number((d.lifetime?.[0]?.amount || 0).toFixed(2)),
    lastYear: Number((d.lastYear?.[0]?.amount || 0).toFixed(2)),
    last6Month: Number((d.last6Month?.[0]?.amount || 0).toFixed(2)),
    lastMonth: Number((d.lastMonth?.[0]?.amount || 0).toFixed(2)),
    lastWeek: Number((d.lastWeek?.[0]?.amount || 0).toFixed(2)),
    yesterday: Number((d.yesterday?.[0]?.amount || 0).toFixed(2)),
    today: Number((d.today?.[0]?.amount || 0).toFixed(2)),
    frequent: {
      amount: Number((d.frequent?.[0]?._id || 0).toFixed(2)),
      count: d.frequent?.[0]?.count || 0,
    },
  };
};
const getGSTSummary = async () => {
  const {
    todayStart,
    yesterdayStart,
    lastWeekStart,
    lastMonthStart,
    last6MonthStart,
    lastYearStart,
  } = getDateRangesB();

  const tomorrowStart = new Date(todayStart.getTime() + 86400000);

  const buildFacet = (match = {}) => [
    { $match: match },
    {
      $group: {
        _id: null,
        gst: {
          $sum: {
            $cond: [
              { $gt: ["$gst_percent", 0] },
              {
                $subtract: [
                  "$amount",
                  {
                    $divide: [
                      "$amount",
                      {
                        $add: [1, { $divide: ["$gst_percent", 100] }],
                      },
                    ],
                  },
                ],
              },
              0,
            ],
          },
        },
      },
    },
  ];

  const result = await Ledger.aggregate([
    {
      $match: {
        transaction_type: Enums.TRANSACTION.TYPE.RECHARGE,
        direction: Enums.TRANSACTION.DIRECTION.CREDIT,
        payment_status: Enums.PAYMENT.STATUS.PAID,
      },
    },
    {
      $facet: {
        lifetime: buildFacet(),
        lastYear: buildFacet({
          timestamp: { $gte: lastYearStart },
        }),
        last6Month: buildFacet({
          timestamp: { $gte: last6MonthStart },
        }),
        lastMonth: buildFacet({
          timestamp: { $gte: lastMonthStart },
        }),
        lastWeek: buildFacet({
          timestamp: { $gte: lastWeekStart },
        }),
        yesterday: buildFacet({
          timestamp: {
            $gte: yesterdayStart,
            $lt: todayStart,
          },
        }),
        today: buildFacet({
          timestamp: {
            $gte: todayStart,
            $lt: tomorrowStart,
          },
        }),
      },
    },
  ]);

  const d = result[0] || {};

  return {
    lifetime: round2(d.lifetime?.[0]?.gst || 0),
    lastYear: round2(d.lastYear?.[0]?.gst || 0),
    last6Month: round2(d.last6Month?.[0]?.gst || 0),
    lastMonth: round2(d.lastMonth?.[0]?.gst || 0),
    lastWeek: round2(d.lastWeek?.[0]?.gst || 0),
    yesterday: round2(d.yesterday?.[0]?.gst || 0),
    today: round2(d.today?.[0]?.gst || 0),
  };
};

const getBalanceSummary = async () => {
  const balances = await Wallet.aggregate([
    {
      $lookup: {
        from: "users",
        localField: "user_id",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },

    {
      $match: {
        "user.isDeleted": false,
      },
    },

    {
      $group: {
        _id: "$user.role",
        totalBalance: {
          $sum: "$balance",
        },
        count: {
          $sum: 1,
        },
      },
    },
  ]);

  const summary = {
    users: 0,
    astrologers: 0,
    vendors: 0,
    admins: 0,
    total: 0,
  };

  balances.forEach((item) => {
    summary.total += item.totalBalance;

    switch (item._id) {
      case Enums.USER.ROLE.USER:
        summary.users = round2(item.totalBalance);
        break;

      case Enums.USER.ROLE.ASTROLOGER:
        summary.astrologers = round2(item.totalBalance);
        break;

      case Enums.USER.ROLE.VENDOR:
        summary.vendors = round2(item.totalBalance);
        break;

      case Enums.USER.ROLE.ADMIN:
        summary.admins = round2(item.totalBalance);
        break;

      case Enums.USER.ROLE.SUPER_ADMIN:
        summary.admins += round2(item.totalBalance);
        break;  
    }
  });

  summary.total = round2(summary.total);

  return summary;
};
exports.getWalletSummary = async () => {
  const [
    currentBalance,
    recharge,
    gst,
    balances,
  ] = await Promise.all([
    getCurrentBalance(),
    getRechargeSummary(),
    getGSTSummary(),
    getBalanceSummary(),
  ]);

  return {
    currentBalance,

    balances,

    recharge,

    gst,
  };
};

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const startOfYesterday = () => {
  const d = startOfToday();
  d.setDate(d.getDate() - 1);
  return d;
};

const daysAgo = (days) => {
  const d = startOfToday();
  d.setDate(d.getDate() - days);
  return d;
};

const monthsAgo = (months) => {
  const d = startOfToday();
  d.setMonth(d.getMonth() - months);
  return d;
};

const yearsAgo = (years) => {
  const d = startOfToday();
  d.setFullYear(d.getFullYear() - years);
  return d;
};

exports.getRecentUsers = async () => {
  const today = startOfToday();
  const yesterday = startOfYesterday();

  const [
    totalUsers,
    totalAstrologers,
    totalVendors,
    totalAdmins,
    lastYear,
    last6Months,
    lastMonth,
    lastWeek,
    yesterdayCount,
    todayCount,
  ] = await Promise.all([
    // Total users
    User.countDocuments({
      isDeleted: false,
      role: Enums.USER.ROLE.USER,
    }),

    // Total astrologers
    User.countDocuments({
      isDeleted: false,
      role: Enums.USER.ROLE.ASTROLOGER,
    }),

    // Total vendors
    User.countDocuments({
      isDeleted: false,
      role: Enums.USER.ROLE.VENDOR,
    }),
    // total admins
    User.countDocuments({
      isDeleted: false,
      role: Enums.USER.ROLE.ADMIN,
    }),

    // Joined last year
    User.countDocuments({
      isDeleted: false,
      createdAt: { $gte: yearsAgo(1) },
    }),

    // Joined last 6 months
    User.countDocuments({
      isDeleted: false,
      createdAt: { $gte: monthsAgo(6) },
    }),

    // Joined last month
    User.countDocuments({
      isDeleted: false,
      createdAt: { $gte: monthsAgo(1) },
    }),

    // Joined last week
    User.countDocuments({
      isDeleted: false,
      createdAt: { $gte: daysAgo(7) },
    }),

    // Yesterday
    User.countDocuments({
      isDeleted: false,
      createdAt: { $gte: yesterday, $lt: today },
    }),

    // Today
    User.countDocuments({
      isDeleted: false,
      createdAt: { $gte: today },
    }),
  ]);

  return {
    totals: {
      users: totalUsers,
      astrologers: totalAstrologers,
      vendors: totalVendors,
      admins: totalAdmins,
    },
    joined: {
      lastYear,
      last6Months,
      lastMonth,
      lastWeek,
      yesterday: yesterdayCount,
      today: todayCount,
    },
  };
};
const toIST = (date) => {
  if (!date) return null;
  return new Date(date).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour12: false,
  });
};
exports.getRecentOrders = async () => {
  const [pendingOrders, completedOrders] = await Promise.all([
    // -------- PENDING PRODUCT ORDERS --------
    Order.find({
      order_type: Enums.ORDER.TYPE.PRODUCT,
      tracking_status: { $ne: Enums.ORDER.STATUS.DELIVERED },
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("total_payable createdAt user_id product_snapshot ")
      .populate("user_id", "name profilePicture"),

    // -------- COMPLETED PRODUCT ORDERS --------
    Order.find({
      order_type: Enums.ORDER.TYPE.PRODUCT,
      tracking_status: Enums.ORDER.STATUS.DELIVERED,
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("total_payable createdAt delivered_at user_id product_snapshot")
      .populate("user_id", "name profilePicture"),
  ]);

  // -------- TOTALS --------
  const pendingTotal = pendingOrders.reduce(
    (sum, o) => sum + (o.total_payable || 0),
    0,
  );

  const completedTotal = completedOrders.reduce(
    (sum, o) => sum + (o.total_payable || 0),
    0,
  );
  return {
    pending: {
      count: pendingOrders.length,
      totalAmount: pendingTotal,
      orders: pendingOrders.map((o) => ({
        productId: o.product_snapshot?.product_id || null,
        productImage: o.product_snapshot?.thumbnailImage || null,
        user: o.user_id?.name || null,
        userProfilePic: o.user_id?.profilePicture || null,
        totalPayable: o.total_payable,
        date: toIST(o.createdAt),
      })),
    },

    completed: {
      count: completedOrders.length,
      totalAmount: completedTotal,
      orders: completedOrders.map((o) => ({
        productId: o.product_snapshot?.product_id || null,
        productImage: o.product_snapshot?.thumbnailImage || null,
        user: o.user_id?.name || null,
        userProfilePic: o.user_id?.profilePicture || null,
        totalPayable: o.total_payable,
        date: toIST(o.delivered_at || o.createdAt),
      })),
    },
  };
};

exports.getDashboardAll = async () => {
  const [overview, communication, earnings, wallet, recentUsers, recentOrders] =
    await Promise.all([
      exports.getOverview(),
      exports.getCommunicationSummary(),
      exports.getEarnings(),
      exports.getWalletSummary(),
      exports.getRecentUsers(),
      exports.getRecentOrders(),
    ]);

  return {
    overview,
    communication,
    earnings,
    wallet,
    recentUsers: recentUsers,
    recentOrders: recentOrders,
  };
};
