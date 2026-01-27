const { createChatSession } = require('../session/sessionService');
const { generateAgoraToken, generateChannelName } = require('./agoraService');
const Enums = require('../../utils/constants');
const { endSession } = require('../session/sessionService'); // assuming you have this

/**
 * Initiate a call session
 * @param {String} userId - The ID of the user initiating the call
 * @param {String} astrologerId - The target astrologer user ID
 * @param {String} mode - Enums.SERVICE.TYPE (e.g., CALL or VIDEO)
 */
async function initiateCall(userId, astrologerId, mode = Enums.SERVICE.TYPE.CALL) {
    // Create the chat/call session with the correct enum mode
    const session = await createChatSession({ userId, astrologerId, mode });

    // Generate a channel name using the enum mode (e.g., CALL_sessionId)
    const channelName = generateChannelName(mode, session.sessionId);

    // Create unique UIDs for both participants
    const userUid = Math.floor(Math.random() * 100000);
    const astroUid = Math.floor(Math.random() * 100000) + 100000;

    // Generate Agora tokens for both participants
    const userToken = await generateAgoraToken(channelName, userUid, 'publisher');
    const astroToken = await generateAgoraToken(channelName, astroUid, 'publisher');

    return {
        sessionId: session.sessionId,
        channelName,
        userToken,
        userUid,
        astroToken,
        astroUid
    };
}

/**
 * Complete a call session
 */
async function completeCall(sessionId) {
    return endSession(sessionId, new Date());
}

module.exports = { initiateCall, completeCall };
