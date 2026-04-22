const mongoose = require("mongoose");
const { Schema } = mongoose;
const Enums = require("../utils/constants");

const traditionSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Tradition name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: [2000, "Description cannot exceed 2000 characters"],
    },
    type: {
      type: Number,
      enum: Object.values(Enums.TRADITION.TYPE),
      default: Enums.TRADITION.TYPE.FESTIVAL,
    },
    paksha: {
      type: String,
      trim: true,
      required: [true, "Paksha is required"],
      enum: ["Shukla Paksha", "Krishna Paksha"],
    },
    tithi: {
      type: String,
      trim: true,
      required: [true, "Tithi is required"],
      enum: [
        "Pratipada",
        "Dwitiya",
        "Tritiya",
        "Chaturthi",
        "Panchami",
        "Shashthi",
        "Saptami",
        "Ashtami",
        "Navami",
        "Dashami",
        "Ekadashi",
        "Dwadashi",
        "Trayodashi",
        "Chaturdashi",
        "Purnima",
        "Amavasya",
      ],
    },
    month: {
      type: String,
      trim: true,
      // required: [true, "Month is required"],
      enum: [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ],
    },
    date: {
      type: Date,
      required: [true, "Date is required"],
    },
    image_url: {
      type: String,
      default: "",
      trim: true,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    created_by: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updated_by: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

// Generate slug before validation
traditionSchema.pre("validate", function (next) {
  if (!this.slug && this.name) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }
  next();
});

module.exports = mongoose.model("Tradition", traditionSchema);
