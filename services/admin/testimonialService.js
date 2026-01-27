const Testimonial = require('../../models/Testimonial');
const { NotFoundError } = require('../../errors');
const logger = require('../../utils/logger');

const addTestimonial = async (data, adminId) => {
  const testimonial = new Testimonial({ ...data, createdBy: adminId });
  const savedTestimonial = await testimonial.save();
  logger.info(`Testimonial created in DB: ${savedTestimonial._id} by admin: ${adminId}`);
  return savedTestimonial;
};

const getAllTestimonials = async (page = 1, limit = 10, search = "") => {
  const skip = (page - 1) * limit;
  const filter = {};

  if (search) {
    filter.name = { $regex: search, $options: "i" };
  }

  const totalDocs = await Testimonial.countDocuments(filter);

  const testimonials = await Testimonial.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  logger.info(
    `Fetched testimonials from DB. Page: ${page}, Count: ${testimonials.length}, Total: ${totalDocs}, Search: "${search}"`
  );

  return { testimonials, totalDocs };
};

const getTestimonialById = async (id) => {
  const testimonial = await Testimonial.findById(id);
  if (!testimonial) {
    logger.info(`Testimonial not found in DB: ${id}`);
    throw new NotFoundError("Testimonial not found");
  }
  logger.info(`Fetched testimonial from DB: ${testimonial._id}`);
  return testimonial;
};

const updateTestimonial = async (id, data, adminId) => {
  const testimonial = await Testimonial.findByIdAndUpdate(
    id,
    { ...data, updatedBy: adminId },
    { new: true, runValidators: true }
  );
  if (!testimonial) {
    logger.info(`Testimonial not found for update: ${id}`);
    throw new NotFoundError("Testimonial not found");
  }
  logger.info(`Testimonial updated in DB: ${testimonial._id} by admin: ${adminId}`);
  return testimonial;
};

const deleteTestimonial = async (id) => {
  const testimonial = await Testimonial.findByIdAndDelete(id);
  if (!testimonial) {
    logger.info(`Testimonial not found for deletion: ${id}`);
    throw new NotFoundError("Testimonial not found");
  }
  logger.info(`Testimonial deleted from DB: ${testimonial._id}`);
  return testimonial;
};

module.exports = {
  addTestimonial,
  getAllTestimonials,
  getTestimonialById,
  updateTestimonial,
  deleteTestimonial,
};