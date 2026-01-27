const Address = require('../../models/Address');
const { buildPaginationResponse } = require('../../utils/pagination');

exports.createAddress = async (userId, data) => {
  await Address.updateMany({ user_id: userId }, { $set: { is_active: false, is_default: false } });

  const address = new Address({
    ...data,
    user_id: userId,
    is_active: true,
    is_default: true
  });

  await address.save();
  return address;
};

exports.updateAddress = async (userId, addressId, updates) => {
  if (updates.is_active === true) {
    await Address.updateMany({ user_id: userId }, { $set: { is_active: false, is_default: false } });
  }

  const address = await Address.findOneAndUpdate(
    { _id: addressId, user_id: userId },
    updates,
    { new: true }
  );

  if (!address) {
    throw new Error('Address not found or unauthorized');
  }

  return address;
};

exports.getAddresses = async (userId, query) => {
  const { page = 1, limit = 10, is_active } = query;

  const filters = { user_id: userId };
  if (is_active !== undefined) {
    filters.is_active = is_active === 'true';
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [addresses, totalDocs] = await Promise.all([
    Address.find(filters)
      .sort({ is_default: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Address.countDocuments(filters)
  ]);

  const totalPages = Math.ceil(totalDocs / limit);

  const pagination = buildPaginationResponse({
    totalDocs,
    totalPages,
    page: parseInt(page),
    limit: parseInt(limit),
  });

  return { addresses, pagination };
};
