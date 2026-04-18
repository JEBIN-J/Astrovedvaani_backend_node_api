const { BadRequestError, NotFoundError } = require("../../errors");
const TaxSlab = require("../../models/TaxSlab");
const redisClient = require("../../utils/redis/redisClient");

const REDIS_KEY = "taxSlabs";

async function getAll() {
  const cached = await redisClient.get(REDIS_KEY);
  if (cached) return JSON.parse(cached);

  const slabs = await TaxSlab.find();
  await redisClient.set(REDIS_KEY, JSON.stringify(slabs));
  return slabs;
}

async function getById(id) {
  if (!id) throw new BadRequestError("id is required");
  const slab = await TaxSlab.findById(id);
  if (!slab) throw new NotFoundError("Tax slab not found");
  return slab;
}

async function create(data, adminId) {
  if (!data.name || data.rate == null) {
    throw new BadRequestError("Name and rate are required");
  }

  const newSlab = await TaxSlab.create({
    name: data.name,
    rate: data.rate,
    applicableServices: data.applicableServices || [],
    createdBy: adminId,
  });

  await redisClient.del(REDIS_KEY);
  return newSlab;
}

async function update(id, data) {
  if (!id) throw new BadRequestError("id is required");
  const slab = await TaxSlab.findById(id);
  if (!slab) throw new NotFoundError("Tax slab not found");

  Object.assign(slab, data);
  await slab.save();

  await redisClient.del(REDIS_KEY);
  return slab;
}

async function remove(id) {
  if (!id) throw new BadRequestError("id is required");
  const slab = await TaxSlab.findById(id);
  if (!slab) throw new NotFoundError("Tax slab not found");

  await slab.deleteOne();
  await redisClient.del(REDIS_KEY);

  return true;
}

async function calculateWithTax(amount, serviceType) {
  const slabs = await getAll();

  const applicable = slabs.filter(
    (s) =>
      Array.isArray(s.applicableServices) &&
      s.applicableServices.includes(serviceType),
  );

  let totalTax = 0;

  applicable.forEach((slab) => {
    totalTax += (amount * slab.rate) / 100;
  });

  return {
    subtotal: amount,
    tax: totalTax,
    total: amount + totalTax,
  };
}

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove,
  calculateWithTax,
};
