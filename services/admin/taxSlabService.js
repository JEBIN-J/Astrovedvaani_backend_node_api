const { BadRequestError, NotFoundError } = require("../../errors");
const TaxSlab = require("../../models/TaxSlab");
const Enums = require("../../utils/constants");
const redisClient = require("../../utils/redis/redisClient");
const logger = require("../../utils/logger");
const REDIS_KEY = "taxSlabs";

async function getAll({ taxContext } = {}) {
  const query = { isActive: true };

  if (taxContext !== undefined && taxContext !== null) {
    query.taxContext = Number(taxContext);
  }

  const redisKey =
    taxContext !== undefined && taxContext !== null
      ? `${REDIS_KEY}_${taxContext}`
      : REDIS_KEY;

  const cached = await redisClient.get(redisKey);
  if (cached) return JSON.parse(cached);

  const slabs = await TaxSlab.find(query, {
    _id: 1,
    name: 1,
    rate: 1,
    taxContext: 1,
  }).lean();

  await redisClient.set(redisKey, JSON.stringify(slabs));
  return slabs;
}
async function getById(id) {
  const cached = await redisClient.get(REDIS_KEY);
  if (cached) {
    const slabs = JSON.parse(cached);

    const slab = id
      ? slabs.find((s) => String(s._id) === String(id))
      : slabs.find((s) => s.taxContext === Enums.TAX.CONTEXT.WALLET);

    if (slab) return slab;
  }

  let slab;
  if (!id) {
    slab = await TaxSlab.findOne(
      {
        taxContext: Enums.TAX.CONTEXT.WALLET,
        isActive: true,
      },
      { _id: 1, name: 1, rate: 1, taxContext: 1 },
    ).lean();

    if (!slab) {
      throw new NotFoundError("Wallet tax slab not found");
    }
  } else {
    slab = await TaxSlab.findById(id, {
      _id: 1,
      name: 1,
      rate: 1,
      taxContext: 1,
    }).lean();

    if (!slab) {
      throw new NotFoundError("Tax slab not found");
    }
  }
  const slabs = await getAll(Enums.TAX.CONTEXT.WALLET);
  return slab;
}
async function create(data, adminId) {
  const { name, rate, taxContext } = data;
  if (!name || rate == null || taxContext == null) {
    throw new BadRequestError("name, rate and taxContext are required");
  }
  if (taxContext === Enums.TAX.CONTEXT.WALLET) {
    const existingWalletSlab = await TaxSlab.findOne({
      taxContext: Enums.TAX.CONTEXT.WALLET,
      isActive: true,
    });

    if (existingWalletSlab) {
      throw new BadRequestError("Wallet tax slab already exists");
    }
  }
  if (taxContext === Enums.TAX.CONTEXT.PRODUCT) {
    const existingRate = await TaxSlab.findOne({
      taxContext: Enums.TAX.CONTEXT.PRODUCT,
      rate,
      isActive: true,
    });

    if (existingRate) {
      throw new BadRequestError(
        `Product tax slab with rate ${rate}% already exists`,
      );
    }
  }

  const newSlab = await TaxSlab.create({
    name,
    rate,
    taxContext,
    createdBy: adminId,
  });
  await clearTaxSlabCache();
  return newSlab;
}
async function update(id, data) {
  if (!id) throw new BadRequestError("id is required");

  const slab = await TaxSlab.findById(id);
  if (!slab) throw new NotFoundError("Tax slab not found");

  const newRate = data.rate ?? slab.rate;
  const newContext = data.taxContext ?? slab.taxContext;

  if (newContext === Enums.TAX.CONTEXT.WALLET) {
    const otherWalletSlab = await TaxSlab.findOne({
      _id: { $ne: id },
      taxContext: Enums.TAX.CONTEXT.WALLET,
      isActive: true,
    });

    if (otherWalletSlab) {
      throw new BadRequestError("Only one wallet tax slab is allowed");
    }
  }

  if (newContext === Enums.TAX.CONTEXT.PRODUCT) {
    const duplicateRate = await TaxSlab.findOne({
      _id: { $ne: id },
      taxContext: Enums.TAX.CONTEXT.PRODUCT,
      rate: newRate,
      isActive: true,
    });

    if (duplicateRate) {
      throw new BadRequestError(
        `Product tax slab with rate ${newRate}% already exists`,
      );
    }
  }
  Object.assign(slab, data);
  await slab.save();
  await clearTaxSlabCache();
  return slab;
}
async function remove(id) {
  if (!id) throw new BadRequestError("id is required");

  const slab = await TaxSlab.findById(id);
  if (!slab) throw new NotFoundError("Tax slab not found");

  await slab.deleteOne();
  await clearTaxSlabCache();
  return true;
}
async function calculateWithTax(amount, taxContext) {
  if (amount == null || taxContext == null) {
    throw new BadRequestError("amount and taxContext are required");
  }
  const slabs = await getAll();
  const slab = slabs.find((s) => s.taxContext === taxContext);
  if (!slab) {
    return {
      subtotal: amount,
      tax: 0,
      total: amount,
    };
  }
  const tax = (amount * slab.rate) / 100;
  return {
    subtotal: amount,
    tax,
    total: amount + tax,
    taxRate: slab.rate,
  };
}
async function clearTaxSlabCache() {
  const keys = await redisClient.keys(`${REDIS_KEY}*`);
  if (keys.length) {
    await redisClient.del(keys);
  }
}
module.exports = {
  getAll,
  getById,
  create,
  update,
  remove,
  calculateWithTax,
};
