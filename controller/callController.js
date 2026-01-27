const { initiateCall, completeCall } = require('../services/agora/callService');
// const { startLiveStream, endLiveStream } = require('../services/agora/liveStreamService');

async function sendCall(req, res) {
    try {
        const userId=req.user._id;
        const {astrologerId, callType } = req.body;

        const result = await initiateCall(userId, astrologerId, callType);

        res.json({ success: true, data: result });
    } catch (error) {
        console.error("Error initiating call:", error);
        res.status(500).json({ error: error.message });
    }
}

async function endCall(req, res) {
    try {
        const { sessionId } = req.body;
        await completeCall(sessionId);
        res.json({ success: true, message: 'Call ended' });
    } catch (error) {
        console.error("Error ending call:", error);
        res.status(500).json({ error: error.message });
    }
}

// async function startLive(req, res) {
//     try {
//         const { astrologerId } = req.body;
//         const astro = await checkAstroExist(astrologerId);
//         if (!astro) return res.status(404).json({ error: 'Astrologer not found' });

//         const result = await startLiveStream(astrologerId);
//         res.json({ success: true, data: result });
//     } catch (error) {
//         console.error("Error starting live stream:", error);
//         res.status(500).json({ error: error.message });
//     }
// }

// async function endLive(req, res) {
//     try {
//         const { sessionId } = req.body;
//         await endLiveStream(sessionId);
//         res.json({ success: true, message: 'Live stream ended' });
//     } catch (error) {
//         console.error("Error ending live stream:", error);
//         res.status(500).json({ error: error.message });
//     }
// }

module.exports = { sendCall, endCall };
