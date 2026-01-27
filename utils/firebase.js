const admin = require('firebase-admin');
const serviceAccount = require('./google-services.json');
const logger = require('./logger');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
//   storageBucket: serviceAccount.project_info.storage_bucket// noed i guess
});

logger.info(`Firebase initialized for project: ${serviceAccount.project_id}`);

module.exports = admin;
