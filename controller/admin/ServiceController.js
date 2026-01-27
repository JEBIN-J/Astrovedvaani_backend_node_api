const integrationService = require("../../services/admin/integrationService");

const addService = async (req, res) => {
  try {
    const result = await integrationService.createIntegration(req.body);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

const updateService = async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) {
      return res
        .status(400)
        .json({ success: false, message: "Missing integration id" });
    }
    const result = await integrationService.updateIntegration(id, req.body);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

const toggleActive = async (req, res) => {
  try {
    const { id } = req.query;
    const result = await integrationService.toggleIntegrationStatus(id);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

const getAll = async (req, res) => {
  try {
    const filters = req.query;
    const results = await integrationService.getAllIntegrations(filters);
    res.status(200).json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.query;
    await integrationService.deleteIntegration(id);
    res
      .status(200)
      .json({ success: true, message: "Integration deleted successfully" });
  } catch (err) {
    res.status(404).json({ success: false, message: err.message });
  }
};

module.exports = {
  addService,
  updateService,
  toggleActive,
  getAll,
  remove,
};
