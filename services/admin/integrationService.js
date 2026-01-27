const ThirdPartyIntegration = require("../../models/ThirdPartyIntegration");
const Enums = require("../../utils/constants");
const RedisClient = require("../../utils/redis/redisClient");

const SMS_CACHE_KEY = "active_sms_integration";
const EMAIL_CACHE_KEY = "active_email_integration";
const CACHE_TTL = 36000;
const clearIntegrationCacheByType = async (type) => {
  try {
    if (type === Enums.INTEGRATION.TYPE.SMS) {
      await RedisClient.del(SMS_CACHE_KEY);
      console.log("Cleared SMS integration cache");
    } else if (type === Enums.INTEGRATION.TYPE.EMAIL) {
      await RedisClient.del(EMAIL_CACHE_KEY);
      console.log("Cleared Email integration cache");
    }
  } catch (err) {
    console.error("Error clearing integration cache:", err.message);
  }
};

const createIntegration = async (data) => {
  const { type, provider } = data;
  const existing = await ThirdPartyIntegration.findOne({ type, provider });
  if (existing) {
    throw new Error(`Integration already exists for provider ${provider} and type ${type}`);
  }
  const newIntegration = new ThirdPartyIntegration(data);
  const saved = await newIntegration.save();
  await clearIntegrationCacheByType(saved.type);
  return saved;
};


const updateIntegration = async (id, data) => {
  const existing = await ThirdPartyIntegration.findById(id);
  if (!existing) throw new Error("Integration not found");
  Object.assign(existing, data);
  const saved = await existing.save();
  await clearIntegrationCacheByType(saved.type);
  return saved;
};

const toggleIntegrationStatus = async (id) => {
  const integration = await ThirdPartyIntegration.findById(id);
  if (!integration) throw new Error("Integration not found");
  const newStatus = !integration.is_active;
  integration.is_active = newStatus;
  const saved = await integration.save();
  await clearIntegrationCacheByType(saved.type);
  return saved;
};

const getAllIntegrations = async (filters = {}) => {
  const query = {};
  if (filters.type) query.type = filters.type;
  if (filters.provider) query.provider = filters.provider;
  if (filters.is_active !== undefined)
    query.is_active = filters.is_active === "true";
  return await ThirdPartyIntegration.find(query);
};

const deleteIntegration = async (id) => {
  const result = await ThirdPartyIntegration.findByIdAndDelete(id);
  if (!result) throw new Error("Integration not found");
  await clearIntegrationCacheByType(result.type);
  return result;
};

const deactivateOtherIntegrations = async (type, excludeId = null) => {
  const updateQuery = {
    type,
    is_active: true,
    ...(excludeId && { _id: { $ne: excludeId } }),
  };

  await ThirdPartyIntegration.updateMany(updateQuery, {
    $set: { is_active: false },
  });
  await clearIntegrationCacheByType(type);
};

module.exports = {
  createIntegration,
  updateIntegration,
  toggleIntegrationStatus,
  getAllIntegrations,
  deleteIntegration,
  deactivateOtherIntegrations,
};
