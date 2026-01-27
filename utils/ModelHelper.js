const User = require('../models/User');

function generateReferralCode(name) {
  const namePrefix = (name || 'XX').substring(0, 2).toUpperCase();
  const now = new Date();

  const pad = (num) => String(num).padStart(2, '0');

  const timestamp = [
    pad(now.getDate()),
    pad(now.getMonth() + 1),
    String(now.getFullYear()).slice(-2),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');

  return `${namePrefix}${timestamp}`;
}

async function generateUniqueReferralCode(name = null) {
  let code;
  let exists = true;

  while (exists) {
    code = generateReferralCode(name);
    exists = await User.exists({ myReferralCode: code });
    if (exists) await new Promise((res) => setTimeout(res, 1000));
  }

  return code;
}

module.exports = {
  generateUniqueReferralCode,
};
