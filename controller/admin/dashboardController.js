const dashboardService = require("../../services/admin/dashboard/dashboardService");

exports.getOverview = async (req, res) => {
  try {
    const data = await dashboardService.getOverview();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getCommunicationSummary = async (req, res) => {
  try {
    const data = await dashboardService.getCommunicationSummary();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getEarnings = async (req, res) => {
  try {
    const data = await dashboardService.getEarnings();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getWalletSummary = async (req, res) => {
  try {
    const data = await dashboardService.getWalletSummary();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getRecentUsers = async (req, res) => {
  try {
    const data = await dashboardService.getRecentUsers();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getRecentOrders = async (req, res) => {
  try {
    const data = await dashboardService.getRecentOrders();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getDashboardAll = async (req, res) => {
  try {
    const data = await dashboardService.getDashboardAll();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
