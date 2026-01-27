const ConsultationSession = require("../../../models/ConsultationSession");
const LiveSession = require("../../../models/LiveSession");
const UserGift = require("../../../models/UserGift");
const Enums = require("../../../utils/constants");

async function getConsultationSummary() {
  const sessions = await ConsultationSession.aggregate([
    {
      $match: {
        mode: {
          $in: [
            Enums.SERVICE.TYPE.CHAT,
            Enums.SERVICE.TYPE.CALL,
            Enums.SERVICE.TYPE.VIDEO,
          ],
        },
      },
    },
    {
      $group: {
        _id: "$mode",

        total: { $sum: 1 },

        completed: {
          $sum: {
            $cond: [{ $eq: ["$status", Enums.SERVICE.STATUS.COMPLETED] }, 1, 0],
          },
        },

        // ✅ FIX: include ONGOING in pending
        pending: {
          $sum: {
            $cond: [
              {
                $in: [
                  "$status",
                  [Enums.SERVICE.STATUS.PENDING, Enums.SERVICE.STATUS.ONGOING],
                ],
              },
              1,
              0,
            ],
          },
        },

        rejected: {
          $sum: {
            $cond: [
              {
                $in: [
                  "$status",
                  [
                    Enums.SERVICE.STATUS.CANCELLED,
                    Enums.SERVICE.STATUS.NO_SHOW,
                  ],
                ],
              },
              1,
              0,
            ],
          },
        },

        // only completed sessions contribute minutes
        totalMinutes: {
          $sum: {
            $cond: [
              { $eq: ["$status", Enums.SERVICE.STATUS.COMPLETED] },
              { $ifNull: ["$duration_minutes", 0] },
              0,
            ],
          },
        },

        // only completed sessions contribute amount
        totalAmount: {
          $sum: {
            $cond: [
              { $eq: ["$status", Enums.SERVICE.STATUS.COMPLETED] },
              { $ifNull: ["$total_amount", 0] },
              0,
            ],
          },
        },
      },
    },
  ]);

  return sessions.reduce((acc, s) => {
    acc[s._id] = {
      total: s.total,
      completed: s.completed,
      pending: s.pending,
      rejected: s.rejected,
      total_minutes: s.totalMinutes,
      total_amount: s.totalAmount,
    };
    return acc;
  }, {});
}
async function getLiveSummary() {
  const { PENDING, COMPLETED, CANCELLED, NO_SHOW, ONGOING } =
    Enums.SERVICE.STATUS;

  const [liveAgg, giftAgg] = await Promise.all([
    LiveSession.aggregate([
      {
        $group: {
          _id: null,

          total: { $sum: 1 },

          completed: {
            $sum: {
              $cond: [{ $eq: ["$status", COMPLETED] }, 1, 0],
            },
          },

          pending: {
            $sum: {
              $cond: [{ $in: ["$status", [PENDING, ONGOING]] }, 1, 0],
            },
          },

          rejected: {
            $sum: {
              $cond: [{ $in: ["$status", [CANCELLED, NO_SHOW]] }, 1, 0],
            },
          },

          liveNow: {
            $sum: {
              $cond: [{ $eq: ["$is_live", true] }, 1, 0],
            },
          },

          totalMinutes: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$actual_start_time", null] },
                    { $ne: ["$end_time", null] },
                  ],
                },
                {
                  $divide: [
                    { $subtract: ["$end_time", "$actual_start_time"] },
                    1000 * 60,
                  ],
                },
                0,
              ],
            },
          },

          totalViewers: { $sum: "$total_viewers" },

          commentCount: {
            $sum: {
              $size: { $ifNull: ["$comments", []] },
            },
          },
        },
      },
    ]),

    UserGift.aggregate([
      {
        $match: {
          live_session_id: { $ne: null },
          status: "SENT",
        },
      },
      {
        $group: {
          _id: null,
          giftTotalAmount: { $sum: "$price" },
          giftCount: { $sum: 1 },
        },
      },
    ]),
  ]);

  const live = liveAgg[0] || {};
  const gifts = giftAgg[0] || {};

  return {
    total: live.total || 0,
    completed: live.completed || 0,
    pending: live.pending || 0,
    rejected: live.rejected || 0,
    live_now: live.liveNow || 0,
    total_minutes: Math.round(live.totalMinutes || 0),
    total_viewers: live.totalViewers || 0,
    comment_count: live.commentCount || 0,
    gift_count: gifts.giftCount || 0,
    gift_total_amount: gifts.giftTotalAmount || 0,
  };
}

module.exports = {
  getConsultationSummary,
  getLiveSummary,
};
