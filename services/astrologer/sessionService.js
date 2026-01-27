const ConsultationSession = require('../../models/ConsultationSession');
const WalletLedger = require('../../models/Ledger'); // alias is okay
const Enums = require('../../utils/constants');

// exports.getSessionsForAstrologer = async (filters, page = 1, limit = 10) => {
//   const skip = (page - 1) * limit;

//   const rawSessions = await ConsultationSession.find(filters)
//     .populate({
//       path: "user_id",
//       select:
//         "name gender birthDate birthTime birthPlace profilePicture followersCount followingCount",
//     })
//     .sort({ start_time: -1 })
//     .skip(skip)
//     .limit(limit)
//     .exec();

//   const total = await ConsultationSession.countDocuments(filters);

//   const sessions = await Promise.all(
//     rawSessions.map(async (session) => {
//       let expected_user_debit = null;
//       let expected_astrologer_credit = null;
//       let expected_admin_earning = null;
//       let actual_user_debit = null;
//       let actual_astrologer_credit = null;
//       let actual_admin_earning = null;

//       if (session.total_amount && session.total_amount > 0) {
//         // ✅ Calculate expected values from session data
//         const commissionPercent = session.commission_pct ?? 0;
//         expected_user_debit = session.total_amount;
//         expected_astrologer_credit = session.astrologer_share_amount ?? Math.round(
//           ((100 - commissionPercent) / 100) * session.total_amount
//         );
//         expected_admin_earning = session.total_amount - expected_astrologer_credit;

//         // ✅ Fetch actual ledger entries using correct key
//         const ledgerEntries = await WalletLedger.find({
//           related_entity_id: session._id.toString(),
//           transaction_type: Enums.TRANSACTION.TYPE.SESSION,
//         }).exec();

//         for (const entry of ledgerEntries) {
//           if (entry.direction === Enums.TRANSACTION.DIRECTION.DEBIT) {
//             actual_user_debit = (actual_user_debit || 0) + entry.amount;
//           } else if (entry.direction === Enums.TRANSACTION.DIRECTION.CREDIT) {
//             if (entry.remarks?.includes("Astrologer share")) {
//               actual_astrologer_credit = (actual_astrologer_credit || 0) + entry.amount;
//             } else if (entry.remarks?.includes("Admin share")) {
//               actual_admin_earning = (actual_admin_earning || 0) + entry.amount;
//             }
//           }
//         }
//       }

//       return {
//         _id: session._id,
//         user: session.user_id,
//         mode: session.mode,
//         start_time: session.start_time,
//         end_time: session.end_time,
//         duration_minutes: session.duration_minutes,
//         rate_per_minute: session.rate_per_minute,
//         total_amount: session.total_amount,
//         status: session.status,
//         payment_status: session.payment_status,
//         meeting_link: session.meeting_link,
//         chat_id: session.chat_id,
//         is_free: session.is_free,
//         createdAt: session.createdAt,
//         updatedAt: session.updatedAt,

//         // ✅ Earnings info (expected vs actual)
//         expected_user_debit,
//         expected_astrologer_credit,
//         expected_admin_earning,
//         actual_user_debit,
//         actual_astrologer_credit,
//         actual_admin_earning,
//       };
//     })
//   );

//   return { sessions, total };
// };


exports.getSessionsForAstrologer = async (filters, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;

  const query = { ...filters };

  // ----------------------------
  // STATUS FILTER (IMPORTANT)
  // ----------------------------
  if (query.status !== undefined) {
    query.status = Number(query.status);
  } else {
    // Default: exclude PENDING (500)
    query.status = { $ne: Enums.SERVICE.STATUS.PENDING };
  }

  // ----------------------------
  // Build and Execute Query
  // ----------------------------
  const rawSessions = await ConsultationSession.find(query)
    .populate({
      path: "user_id",
      select:
        "name gender birthDate birthTime birthPlace profilePicture followersCount followingCount",
    })
    .sort({ start_time: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await ConsultationSession.countDocuments(query);

  const sessions = await Promise.all(
    rawSessions.map(async (session) => {
      let expected_user_debit = null;
      let expected_astrologer_credit = null;
      let expected_admin_earning = null;
      let actual_user_debit = null;
      let actual_astrologer_credit = null;
      let actual_admin_earning = null;

      if (session.total_amount && session.total_amount > 0) {
        const commissionPercent = session.commission_pct ?? 0;

        // Expected earnings
        expected_user_debit = session.total_amount;
        expected_astrologer_credit =
          session.astrologer_share_amount ??
          Math.round(((100 - commissionPercent) / 100) * session.total_amount);
        expected_admin_earning =
          session.total_amount - expected_astrologer_credit;

        // Actual ledger entries
        const ledgerEntries = await WalletLedger.find({
          related_entity_id: session._id.toString(),
          transaction_type: Enums.TRANSACTION.TYPE.SESSION,
        }).lean();

        for (const entry of ledgerEntries) {
          if (entry.direction === Enums.TRANSACTION.DIRECTION.DEBIT) {
            actual_user_debit = (actual_user_debit || 0) + entry.amount;
          } else if (entry.direction === Enums.TRANSACTION.DIRECTION.CREDIT) {
            if (entry.remarks?.includes("Astrologer share")) {
              actual_astrologer_credit =
                (actual_astrologer_credit || 0) + entry.amount;
            } else if (entry.remarks?.includes("Admin share")) {
              actual_admin_earning =
                (actual_admin_earning || 0) + entry.amount;
            }
          }
        }
      }

      return {
        _id: session._id,
        user: session.user_id,
        mode: session.mode,
        start_time: session.start_time,
        end_time: session.end_time,
        duration_minutes: session.duration_minutes,
        rate_per_minute: session.rate_per_minute,
        total_amount: session.total_amount,
        status: session.status,
        payment_status: session.payment_status,
        meeting_link: session.meeting_link,
        chat_id: session.chat_id,
        is_free: session.is_free,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,

        expected_user_debit,
        expected_astrologer_credit,
        expected_admin_earning,
        actual_user_debit,
        actual_astrologer_credit,
        actual_admin_earning,
      };
    })
  );

  return { sessions, total };
};

