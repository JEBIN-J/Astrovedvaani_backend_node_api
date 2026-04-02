const express = require("express");
const router = express.Router();

const controller = require("../../controller/admin/astroRequestController");

router.route("/").get(controller.getAllRequests);

router.route("/:requestId").put(controller.updateRequest)
                            .delete(controller.deleteRequest);

module.exports = router;