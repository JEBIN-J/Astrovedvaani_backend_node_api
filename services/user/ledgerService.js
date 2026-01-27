const Wallet = require('../../models/Wallet');
const WalletLedger = require('../../models/Ledger');
const logger = require('../../utils/logger');
const { buildPaginationResponse } = require('../../utils/pagination');

exports.fetchUserLedger = async (userId, page = 1, limit = 20, filters = {}) => {
  logger.info('[fetchUserLedger] Called with', { userId, page, limit, filters });

  const skip = (page - 1) * limit;

  // Get wallet
  const wallet = await Wallet.findOne({ user_id: userId }).lean();
  if (!wallet) {
    throw new Error('Wallet not found for user');
  }

  // Build query
  const query = { wallet_id: wallet._id };

  if (filters.transaction_type !== undefined) {
    query.transaction_type = filters.transaction_type;
  }

  if (filters.direction !== undefined) {
    query.direction = filters.direction;
  }

  if (filters.payment_method !== undefined) {
    query.payment_method = filters.payment_method;
  }

  if (filters.startDate || filters.endDate) {
    query.timestamp = {};
    if (filters.startDate) {
      query.timestamp.$gte = new Date(filters.startDate);
    }
    if (filters.endDate) {
      query.timestamp.$lte = new Date(filters.endDate);
    }
  }

  // Fetch ledger entries
  const [ledgers, totalDocs] = await Promise.all([
    WalletLedger.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    WalletLedger.countDocuments(query)
  ]);

  const result = ledgers.map(entry => ({
    id: entry._id,
    transactionType: entry.transaction_type,
    direction: entry.direction,
    amount: entry.amount,
    finalAmount: entry.final_amount,
    paymentMethod: entry.payment_method,
    paymentProvider: entry.payment_provider,
    externalTransactionId: entry.external_transaction_id,
    orderId: entry.order_id,
    related_entity_id: entry.related_entity_id,
    related_entity_type:entry.related_entity_type,
    bonus_amount:entry.bonus_amount,
    remarks: entry.remarks,
    timestamp: entry.timestamp,
    payment_status: entry.payment_status,
  }));

  return {
    walletId: wallet._id,
    balance: wallet.balance,
    ledger: result,
    pagination: buildPaginationResponse({
      totalDocs,
      totalPages: Math.ceil(totalDocs / limit),
      page,
      limit
    })
  };
};
