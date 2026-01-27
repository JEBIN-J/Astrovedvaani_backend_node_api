const ConsultationSession = require('../../../models/ConsultationSession');
const WalletLedger = require('../../../models/Ledger');
const { buildPaginationResponse } = require('../../../utils/pagination');
const mongoose = require('mongoose');
const Enums = require('../../../utils/constants');
const { getAstrologerDetails } = require('../../session/astrologerService');
const { getFeedBackBySourceId } = require('../feedBackService');

function sanitizeUser(user) {
  if (!user) return null;

  const {
    devices,
    fcmToken,
    apiKeys,
    birthTime,
    birthPlace,
    ...safeUser
  } = user;

  if (apiKeys && Array.isArray(apiKeys)) {
    safeUser.apiKeys = apiKeys.map(key => ({
      key: key.key,
      name: key.name,
      createdAt: key.createdAt,
      lastUsed: key.lastUsed,
      isActive: key.isActive
    }));
  }

  return safeUser;
}

exports.getConsultationSessions = async (filters) => {
  const {
    user_id,
    astrologer_user_id,
    astrologer_id,
    status,
    payment_status,
    start_date,
    end_date,
    page = 1,
    limit = 10,
  } = filters;

  const query = {};

  if (user_id && mongoose.Types.ObjectId.isValid(user_id)) {
    query.user_id = user_id;
  }

  if (astrologer_user_id && mongoose.Types.ObjectId.isValid(astrologer_user_id)) {
    query.astrologer_user_id = astrologer_user_id;
  }

  if (astrologer_id && mongoose.Types.ObjectId.isValid(astrologer_id)) {
    query.astrologer_id = astrologer_id;
  }
  if (status !== undefined) {
    query.status = Number(status);
  } else {
    query.status = { $ne: Enums.SERVICE.STATUS.PENDING };
  }
  if (payment_status !== undefined) {
    query.payment_status = Number(payment_status);
  }
  if (start_date || end_date) {
    query.createdAt = {};
    if (start_date) query.createdAt.$gte = new Date(start_date);
    if (end_date) query.createdAt.$lte = new Date(end_date);
  }
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [rawSessions, totalDocs] = await Promise.all([
    ConsultationSession.find(query)
      .populate({ path: 'user_id' })
      .populate({ path: 'astrologer_id' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    ConsultationSession.countDocuments(query),
  ]);
  const sessions = await Promise.all(
    rawSessions.map(async (session) => {
      const isFree = session.is_free;
      let expected_user_debit = null;
      let expected_astrologer_credit = null;
      let expected_admin_earning = null;
      let actual_user_debit = null;
      let actual_astrologer_credit = null;
      let actual_admin_earning = null;
      if (!isFree && session.total_amount && session.astrologer_user_id) {
        const { serviceRate } = await getAstrologerDetails(session.astrologer_user_id);
        const commissionPercent = serviceRate?.commission_pct ?? 0;
        expected_astrologer_credit = Math.round(
          (commissionPercent / 100) * session.total_amount
        );
        expected_admin_earning = session.total_amount - expected_astrologer_credit;
        expected_user_debit = session.total_amount;
        const ledgerEntries = await WalletLedger.find({
          related_entity: session._id,
          transaction_type: Enums.TRANSACTION.TYPE.SESSION,
        }).lean();
        for (const entry of ledgerEntries) {
          if (entry.direction === Enums.TRANSACTION.DIRECTION.DEBIT) {
            actual_user_debit = (actual_user_debit || 0) + entry.amount;
          } else if (entry.direction === Enums.TRANSACTION.DIRECTION.CREDIT) {
            if (entry.remarks?.includes('Astrologer share')) {
              actual_astrologer_credit = (actual_astrologer_credit || 0) + entry.amount;
            } else if (entry.remarks?.includes('Admin share')) {
              actual_admin_earning = (actual_admin_earning || 0) + entry.amount;
            }
          }
        }
      }
      const feedback = await getFeedBackBySourceId(session._id);
      return {
        ...session,
        user: sanitizeUser(session.user_id),
        astrologer: sanitizeUser(session.astrologer_id),
        expected_user_debit,
        expected_astrologer_credit,
        expected_admin_earning,
        actual_user_debit,
        actual_astrologer_credit,
        actual_admin_earning,
        rating: feedback?.rating ?? null,
        review: feedback?.review ?? null,
      };
    })
  );

  sessions.forEach((session) => {
    delete session.user_id;
    delete session.astrologer_id;
    delete session.astrologer_user_id;
  });
  const totalPages = Math.ceil(totalDocs / limit);
  const pagination = buildPaginationResponse({
    totalDocs,
    totalPages,
    page: parseInt(page),
    limit: parseInt(limit),
  });
  return {
    sessions,
    pagination,
  };
};