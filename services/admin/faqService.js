const FAQ = require("../../models/FAQ");
const { NotFoundError } = require("../../errors");
const logger = require("../../utils/logger");

const addFAQ = async (data, adminId) => {
  const faq = new FAQ({ ...data, createdBy: adminId });
  const savedFAQ = await faq.save();
  logger.info(`FAQ created in DB: ${savedFAQ._id} by admin: ${adminId}`);
  return savedFAQ;
};

const getAllFAQs = async (page = 1, limit = 10, search = "") => {
  const skip = (page - 1) * limit;
  const filter = {};

  if (search) {
    filter.question = { $regex: search, $options: "i" };
  }

  const totalDocs = await FAQ.countDocuments(filter);

  const faqs = await FAQ.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  logger.info(
    `Fetched FAQs from DB. Page: ${page}, Count: ${faqs.length}, Total: ${totalDocs}, Search: "${search}"`,
  );

  return { faqs, totalDocs };
};

const getFAQById = async (id) => {
  const faq = await FAQ.findById(id);
  if (!faq) {
    logger.info(`FAQ not found in DB: ${id}`);
    throw new NotFoundError("FAQ not found");
  }
  logger.info(`Fetched FAQ from DB: ${faq._id}`);
  return faq;
};

const updateFAQ = async (id, data, adminId) => {
  const faq = await FAQ.findByIdAndUpdate(
    id,
    { ...data, updatedBy: adminId },
    { new: true, runValidators: true },
  );
  if (!faq) {
    logger.info(`FAQ not found for update: ${id}`);
    throw new NotFoundError("FAQ not found");
  }
  logger.info(`FAQ updated in DB: ${faq._id} by admin: ${adminId}`);
  return faq;
};

const deleteFAQ = async (id) => {
  const faq = await FAQ.findByIdAndDelete(id);
  if (!faq) {
    logger.info(`FAQ not found for deletion: ${id}`);
    throw new NotFoundError("FAQ not found");
  }
  logger.info(`FAQ deleted from DB: ${faq._id}`);
  return faq;
};

module.exports = {
  addFAQ,
  getAllFAQs,
  getFAQById,
  updateFAQ,
  deleteFAQ,
};
