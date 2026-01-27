// const { generateAgoraToken, generateChannelName } = require('./agoraService');
// const { createSession, endSession } = require('../utils/sessionService');
// const { storeLiveStream } = require('../utils/queueStore');

// async function startLiveStream(astrologerId) {
//     const session = await createSession({ astrologerId, type: 'live' });
//     const channelName = generateChannelName('live', session.sessionId);
//     const astroUid = Math.floor(Math.random() * 100000);
//     const astroToken = await generateAgoraToken(channelName, astroUid, 'publisher');
//     await storeLiveStream({
//         astrologerId,
//         sessionId: session.sessionId,
//         channelName,
//         astroUid
//     });
//     return {
//         sessionId: session.sessionId,
//         channelName,
//         astroToken,
//         astroUid
//     };
// }

// async function endLiveStream(sessionId) {
//     return endSession(sessionId, new Date());
// }

// module.exports = { startLiveStream, endLiveStream };
