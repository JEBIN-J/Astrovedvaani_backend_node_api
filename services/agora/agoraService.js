const { RtcTokenBuilder, RtcRole } = require('agora-token');
const { v4: uuidv4 } = require('uuid');
const ThirdPartyIntegration = require('../../models/ThirdPartyIntegration');
const Enums = require('../../utils/constants');

async function getAgoraConfig() {
    const config = await ThirdPartyIntegration.findOne({
        type: Enums.INTEGRATION.TYPE.CALL,
        is_active: true
    });
    if (!config) {
        throw new Error("Agora integration not found or inactive in DB");
    }
    return {
        APP_ID: config.api_key,
        APP_CERTIFICATE: config.api_secret,
        TOKEN_EXPIRATION: config.extra_config?.token_expiry || 3600
    };
}
async function generateAgoraToken(channelName, uid, role = 'publisher', durationMinutes = 30) {
    const { APP_ID, APP_CERTIFICATE } = await getAgoraConfig();
    const rtcRole = role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
    const currentTime = Math.floor(Date.now() / 1000);
    const privilegeExpireTime = currentTime + durationMinutes * 60 + 30;
    return RtcTokenBuilder.buildTokenWithUid(
        APP_ID,
        APP_CERTIFICATE,
        channelName,
        Number(uid),
        rtcRole,
        privilegeExpireTime
    );
}

function generateChannelName(type, sessionId) {
    return `${type}_${sessionId || uuidv4()}`;
}

module.exports = {
    generateAgoraToken,
    generateChannelName
};
