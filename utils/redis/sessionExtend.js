const CacheService = require("./cacheService");
const SESSION_PREFIX = "session:active";
const IN_SESSION_PREFIX = "session:inSession";

async function incrementSessionExtended(sessionId) {
  if (!sessionId) return 0;
  const key = `${SESSION_PREFIX}:${sessionId}`;
  try {
    const session = await CacheService.get(key) || {};
    session.extended_count = (session.extended_count || 0) + 1;
    await CacheService.set(key, session);
    console.log(`[SessionFlag] Session ${sessionId} extended count updated: ${session.extended_count}`);
    return session.extended_count;
  } catch (err) {
    console.error(`[SessionFlag] Failed to increment extended count for session ${sessionId}: ${err.message}`);
    return 0;
  }
}
async function clearSessionExtendedCount(sessionId) {
  if (!sessionId) return;
  const key = `${SESSION_PREFIX}:${sessionId}`;
  try {
    const session = await CacheService.get(key);
    if (!session) return;
    session.extended_count = 0;
    await CacheService.set(key, session);
    console.log(`[SessionFlag] Session ${sessionId} extended count cleared`);
  } catch (err) {
    console.error(`[SessionFlag] Failed to clear extended count for session ${sessionId}: ${err.message}`);
  }
}
async function getSessionExtendedCount(sessionId) {
  if (!sessionId) return 0;
  const key = `${SESSION_PREFIX}:${sessionId}`;
  try {
    const session = await CacheService.get(key);
    return session?.extended_count || 0;
  } catch (err) {
    console.error(`[SessionFlag] Failed to get extended count for session ${sessionId}: ${err.message}`);
    return 0;
  }
}
async function setInSession(sessionId, userId, value = true) {
  if (!sessionId || !userId) return;
  const key = `${IN_SESSION_PREFIX}:${sessionId}`;
  try {
    const flags = (await CacheService.get(key)) || {};
    flags[userId] = value;
    await CacheService.set(key, flags);
    console.log(`[SessionFlag] sessionId=${sessionId} userId=${userId} inSession set to ${value}`);
  } catch (err) {
    console.error(`[SessionFlag] Failed to set inSession for userId ${userId} in session ${sessionId}: ${err.message}`);
  }
}
async function getInSession(sessionId, userId) {
  if (!sessionId || !userId) return false;
  const key = `${IN_SESSION_PREFIX}:${sessionId}`;
  try {
    const flags = await CacheService.get(key);
    console.log(`[SessionFlag] sessionId=${sessionId} userId=${userId} inSession flag:`, flags);
    return !!flags?.[userId];
  } catch (err) {
    console.error(`[SessionFlag] Failed to get inSession for userId ${userId} in session ${sessionId}: ${err.message}`);
    return false;
  }
}
async function clearInSession(sessionId) {
  if (!sessionId) return;
  const key = `${IN_SESSION_PREFIX}:${sessionId}`;
  try {
    await CacheService.del(key);
    console.log(`[SessionFlag] sessionId=${sessionId} inSession flags cleared`);
  } catch (err) {
    console.error(`[SessionFlag] Failed to clear inSession flags for session ${sessionId}: ${err.message}`);
  }
}
module.exports = {
  incrementSessionExtended,
  clearSessionExtendedCount,
  getSessionExtendedCount,
  setInSession,
  getInSession,
  clearInSession,
};