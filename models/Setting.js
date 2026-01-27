const mongoose = require("mongoose");
const { Schema } = mongoose;

const settingSchema = new Schema({
    ischatAllow: { type: Boolean, default: true },
    isVoiceCallAllow: { type: Boolean, default: true },
    isVideoCallAllow: { type: Boolean, default: true },
    isLiveStreamAllow: { type: Boolean, default: true },
    isAutoLogOutEnable: { type: Boolean, default: true },
    maxDeviceThreshold: { type: Number, default: 20 },

    isHoroscope: { type: Boolean, default: true },
    isPanchang: { type: Boolean, default: true },
    isAiAstrologer: { type: Boolean, default: true },
    isPooja: { type: Boolean, default: true },
    isRemedies: { type: Boolean, default: true },
    isNumerology: { type: Boolean, default: true },
    isMatchmaking: { type: Boolean, default: true },
    isReport: { type: Boolean, default: true },
    isCharts: { type: Boolean, default: true },
    isMantra: { type: Boolean, default: true },
    isYoga: { type: Boolean, default: true },
    isChant: { type: Boolean, default: true },
    isTarot: { type: Boolean, default: true },
    isPalmistry: { type: Boolean, default: true },
    isKundli: { type: Boolean, default: true },
    isGoodBadDays: { type: Boolean, default: true },
    isAstroFeed: { type: Boolean, default: true },
    isTestimonials: { type: Boolean, default: true },
    isAstroChat: { type: Boolean, default: true },
    isStore: { type: Boolean, default: true },
    isGame: { type: Boolean, default: true },

    isProfile: { type: Boolean, default: true },
    isOrder: { type: Boolean, default: true },
    isChatHistory: { type: Boolean, default: true },
    isContactUs: { type: Boolean, default: true },
    isSetting: { type: Boolean, default: true },
    isTermAndCondition: { type: Boolean, default: true },
    isPrivacyAndRefund: { type: Boolean, default: true },
    isMyChatList: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model("Setting", settingSchema);
