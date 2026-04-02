const mongoose = require("mongoose");
const { Schema } = mongoose;
const crypto = require("crypto");
const Enums = require("../utils/constants");

const userSchema = new Schema(
  {
    name: { type: String, trim: true },
    gender: {
      type: Number,
      enum: Object.values(Enums.USER.GENDER),
      default: Enums.USER.GENDER.FEMALE,
    },
    mobileNumber: {
      type: String,
      default: undefined,
    },
    countryCode: { type: String, trim: true, default: "+91" },
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    loginMethod: {
      type: Number,
      enum: Object.values(Enums.USER.LOGIN_METHOD),
      required() {
        return this.role !== Enums.USER.ROLE.AI_ASTROLOGER;
      },
    },
    password: {
      type: String,
      select: false,
      required() {
        const method = this.loginMethod;
        const isPasswordLogin = method === Enums.USER.LOGIN_METHOD.PASSWORD;
        const isNonAi = this.role !== Enums.USER.ROLE.AI_ASTROLOGER;
        return isPasswordLogin && isNonAi;
      },
    },
    birthDate: Date,
    birthTime: String,
    birthPlace: String,
    profilePicture: String,
    smallProfilePicture: String,
    relationship_status: {
      type: Number,
      enum: Object.values(Enums.USER.RELATIONSHIP_STATUS),
      default: Enums.USER.RELATIONSHIP_STATUS.NOT_DISCLOSE,
    },
    role: {
      type: Number,
      enum: Object.values(Enums.USER.ROLE),
      default: Enums.USER.ROLE.USER,
    },
    isActive: { type: Boolean, default: true },
    isNewUser: { type: Boolean, default: true },
    isBlock: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    isOnboarded: { type: Boolean, default: false },
    deletedAt: { type: Date },
    freeSessionUsed: {
      type: Number,
      default: 0,
    },
    lastFreeSessionUsedAt: {
      type: Date,
    },
    lastLogin: Date,
    fcmToken: { type: String, default: null },
    devices: [
      {
        deviceId: { type: String, required: true },
        longitude: Number,
        latitude: Number,
        loginAt: { type: Date, default: Date.now },
        os: { type: String, enum: ["web", "android", "ios"], default: "web" },
        modelNumber: { type: String, default: null },
      },
    ],
    currentSessionId: {
      type: String,
      default: null,
    },
    referredByCode: {
      type: String,
      ref: "ReferralCode",
      default: null,
    },
    myReferralCode: {
      type: String,
      uppercase: true,
      trim: true,
    },
    apiKeys: [
      {
        key: String,
        secret: { type: String, select: false },
        name: String,
        createdAt: { type: Date, default: Date.now },
        lastUsed: Date,
        isActive: { type: Boolean, default: true },
      },
    ],
    aiConfig: {
      modelName: {
        type: String,
        required() {
          return this.role === Enums.USER.ROLE.AI_ASTROLOGER;
        },
      },
      version: String,
      capabilities: [String],
      endpoint: String,
      rateLimit: { type: Number, default: 60 },
      isAlwaysAvailable: { type: Boolean, default: true },
    },
    verificationStatus: {
      type: Number,
      enum: Object.values(Enums.USER.VERIFICATION_STATUS),
      default: Enums.USER.VERIFICATION_STATUS.PENDING,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required() {
        return this.role === Enums.USER.ROLE.AI_ASTROLOGER;
      },
    },
    description: {
      type: String,
      required() {
        return this.role === Enums.USER.ROLE.AI_ASTROLOGER;
      },
    },
    currentTag: {
      tag: {
        type: Number,
        enum: Object.values(Enums.USER.TAGS),
        default: Enums.USER.TAGS.NEW_USER
      },
      assignedAt: {
        type: Date,
        default: Date.now
      }
    },

    userTags: [
      {
        tag: {
          type: Number,
          enum: Object.values(Enums.USER.TAGS),
          required: true
        },
        source: {
          type: Number,
          enum: Object.values(Enums.USER.TAG_SOURCE),
          default: Enums.USER.TAG_SOURCE.SYSTEM
        },
        assignedAt: {
          type: Date,
          default: Date.now
        },
        expiresAt: Date,
        metadata: Schema.Types.Mixed
      }
    ]

  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);
userSchema.virtual("isAi").get(function () {
  return this.role === Enums.USER.ROLE.AI_ASTROLOGER;
});
userSchema.index(
  { mobileNumber: 1, countryCode: 1 },
  {
    unique: true,
    partialFilterExpression: { mobileNumber: { $type: "string" } },
  },
);

userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ referredByCode: 1 });
userSchema.index({ myReferralCode: 1 }, { unique: true, sparse: true });
userSchema.index({ role: 1 });
userSchema.index({ verificationStatus: 1 });
userSchema.index({ "apiKeys.key": 1 }, { unique: true, sparse: true });
userSchema.methods.generateApiKey = function (name) {
  if (this.role !== Enums.USER.ROLE.AI_ASTROLOGER) {
    throw new Error("Only AI astrologers can generate API keys");
  }

  const key = crypto.randomBytes(32).toString("hex");
  const secret = crypto.randomBytes(64).toString("hex");

  this.apiKeys.push({
    key,
    secret,
    name: name || "Default Key",
  });

  return { key, secret };
};
userSchema.methods.revokeApiKey = function (keyId) {
  const key = this.apiKeys.id(keyId);
  if (!key) throw new Error("API key not found");
  key.isActive = false;
  return this.save();
};
module.exports = mongoose.model("User", userSchema);