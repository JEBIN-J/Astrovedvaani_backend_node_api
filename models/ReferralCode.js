const mongoose = require('mongoose');
const { Schema } = mongoose;

const referralCodeSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    expiresAt: Date,
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// ✅ Add index explicitly once
referralCodeSchema.index({ userId: 1 });

// Static method to generate a unique code
referralCodeSchema.statics.generateUniqueCode = async function (name = 'XX') {
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const namePrefix = name.substring(0, 2).toUpperCase();
  const timestamp = [
    pad(now.getDate()),
    pad(now.getMonth() + 1),
    String(now.getFullYear()).slice(-2),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');

  const ReferralCode = this;
  let code = `${namePrefix}${timestamp}`;
  let exists = true;

  while (exists) {
    exists = await ReferralCode.exists({ code });
    if (exists) {
      await new Promise((res) => setTimeout(res, 1000));
      const now = new Date();
      code = `${namePrefix}${pad(now.getSeconds())}${pad(now.getMilliseconds())}`;
    }
  }

  return code;
};

module.exports = mongoose.model('ReferralCode', referralCodeSchema);
