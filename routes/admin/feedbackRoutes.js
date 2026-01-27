const express = require('express');
const feedBackController = require('../../controller/admin/feedBackController');

const router = express.Router();

router.get('/fetch-all-feedback', feedBackController.fetchAllFeedbacks);
router.put("/visibility", feedBackController.updateSingleFeedback);
router.post("/bulk-visibility", feedBackController.bulkUpdateFeedbacks);
router.delete("/delete", feedBackController.deleteFeedback);


module.exports = router;

module.exports = router;
