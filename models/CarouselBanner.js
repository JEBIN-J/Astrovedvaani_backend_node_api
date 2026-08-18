const mongoose = require("mongoose");
const Enums = require("../utils/constants");

const carouselBannerSchema = new mongoose.Schema({
  title: {
    type: String,
    default: "",
  },

  imageUrl: {
    type: String,
    required: true,
  },

  position: {
    type: Number,
    required: true,
  },

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

  isPromotional: {
    type: Boolean,
    default: false,
  },

  startDate: {
    type: Date,
    default: null,
  },

  endDate: {
    type: Date,
    default: null,
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

/*
|--------------------------------------------------------------------------
| Convert empty redirectId to null
|--------------------------------------------------------------------------
*/
carouselBannerSchema.pre("validate", function (next) {
  if (this.redirectId === "") {
    this.redirectId = null;
  }

  next();
});

/*
|--------------------------------------------------------------------------
| CREATE
|--------------------------------------------------------------------------
*/
carouselBannerSchema.pre("save", function (next) {
  // Empty redirectId should be treated as null
  if (this.redirectId === "") {
    this.redirectId = null;
  }

  // Set redirectModel only when both values exist
  if (this.bannerType != null && this.redirectId != null) {
    this.redirectModel = resolveRedirectModel(this.bannerType);
  } else {
    this.redirectModel = null;
  }

  next();
});

/*
|--------------------------------------------------------------------------
| UPDATE
|--------------------------------------------------------------------------
*/
carouselBannerSchema.pre("findOneAndUpdate", async function (next) {
  try {
    const update = this.getUpdate();

    // Support both:
    // { $set: {...} }
    // and
    // { field: value }
    const data = update.$set || update;

    /*
    |--------------------------------------------------------------------------
    | Convert empty redirectId to null
    |--------------------------------------------------------------------------
    */
    if (data.redirectId === "") {
      data.redirectId = null;
    }

    /*
    |--------------------------------------------------------------------------
    | Get existing banner
    |--------------------------------------------------------------------------
    */
    const existing = await this.model.findOne(this.getQuery());

    /*
    |--------------------------------------------------------------------------
    | Get final bannerType
    |--------------------------------------------------------------------------
    */
    const bannerType =
      data.bannerType !== undefined
        ? data.bannerType
        : existing?.bannerType;

    /*
    |--------------------------------------------------------------------------
    | Get final redirectId
    |--------------------------------------------------------------------------
    */
    const redirectId =
      data.redirectId !== undefined
        ? data.redirectId
        : existing?.redirectId;

    /*
    |--------------------------------------------------------------------------
    | Set redirectModel
    |--------------------------------------------------------------------------
    */
    if (bannerType != null && redirectId != null) {
      data.redirectModel = resolveRedirectModel(bannerType);
    } else {
      data.redirectModel = null;
    }

    /*
    |--------------------------------------------------------------------------
    | Put modified data back into update
    |--------------------------------------------------------------------------
    */
    if (update.$set) {
      update.$set = data;
    } else {
      this.setUpdate(data);
    }

    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model(
  "CarouselBanner",
  carouselBannerSchema
);