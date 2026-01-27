const cron = require('node-cron');
const AdminNotification = require('../models/AdminNotification');
const User = require('../models/User');
const { notifyUsers } = require('../services/notification/notifyService');

// Run every minute
cron.schedule('* * * * *', async () => {
  try {
    const notifications = await AdminNotification.find({
      type: 'scheduled',
      scheduled_at: { $lte: new Date() },
      sent: false
    }).lean();

    for (const notif of notifications) {
      let userFilter = {};
      switch (notif.role) {
        case 'all':
          userFilter = {};
          break;
        case 'users':
          userFilter = { role: 100 };
          break;
        case 'astrologers':
          userFilter = { role: 101 };
          break;
        case 'newUsers':
          userFilter = { role: 100, createdAt: { $gte: new Date(Date.now() - 7*24*60*60*1000) } };
          break;
        case 'newAstrologers':
          userFilter = { role: 101, createdAt: { $gte: new Date(Date.now() - 7*24*60*60*1000) } };
          break;
      }
      const users = await User.find(userFilter).lean();
      await notifyUsers(users, notif.title, notif.message, { type: 'ADMIN_CAMPAIGN', notificationId: notif._id });
      await AdminNotification.updateOne({ _id: notif._id }, { $set: { sent: true } });
    }
  } catch (err) {
    console.error('Error sending scheduled notifications', err);
  }
});
