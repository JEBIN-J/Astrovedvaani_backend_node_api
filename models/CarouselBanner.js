const mongoose = require("mongoose");
const Enums = require("../utils/constants");

const carouselBannerSchema = new mongoose.Schema({
  title: { type: String, default: "" },

  imageUrl: { type: String, required: true },

  position: { type: Number, required: true },

  bannerType: {
    type: Number,
    enum: Object.values(Enums.BANNER_TYPE),
    default: null,
  },

  redirectId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: "redirectModel",
    default: null,
  },

  redirectModel: {
    type: String,
    default: null,
  },

  slug: {
    type: String,
    default: null,
    trim: true,
  },

  isActive: {
    type: Boolean,
    default: true,
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

function resolveRedirectModel(bannerType) {
  switch (bannerType) {
    case Enums.BANNER_TYPE.POOJA_PAGE:
      return "PoojaMaster";
    case Enums.BANNER_TYPE.PRODUCT_PAGE:
      return "Product";
    case Enums.BANNER_TYPE.ASTROLOGER_LISTING_PAGE:
      return "Astrologer";
    case Enums.BANNER_TYPE.BLOG_PAGE:
      return "Blog";
    default:
      return null;
  }
}

carouselBannerSchema.pre("save", function (next) {
  if (this.bannerType && this.redirectId) {
    this.redirectModel = resolveRedirectModel(this.bannerType);
  } else {
    this.redirectModel = null;
  }
  next();
});

carouselBannerSchema.pre("findOneAndUpdate", async function (next) {
  const update = this.getUpdate();

  // $set support
  const data = update.$set || update;

  // fetch existing document
  const existing = await this.model.findOne(this.getQuery());

  const bannerType =
    data.bannerType !== undefined ? data.bannerType : existing.bannerType;

  const redirectId =
    data.redirectId !== undefined ? data.redirectId : existing.redirectId;

  if (bannerType && redirectId) {
    data.redirectModel = resolveRedirectModel(bannerType);
  } else {
    data.redirectModel = null;
  }

  if (update.$set) {
    update.$set = data;
  } else {
    this.setUpdate(data);
  }

  next();
});

module.exports = mongoose.model("CarouselBanner", carouselBannerSchema);
