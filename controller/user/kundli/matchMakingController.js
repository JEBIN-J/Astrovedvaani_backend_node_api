const matchMakingService = require("../../../services/user/kundli/matchMakingService");

const getMatchMakingReport = async (req, res) => {
  try {
    const filters = req.query;
    if (!filters.boy_dob || !filters.girl_dob) {
      return res.status(400).json({ 
        success: false, 
        message: 'Both boy and girl dates of birth are required' 
      });
    }

    const results = await matchMakingService.getMatchMakingReport(filters);
    res.status(200).json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: err.message || 'Failed to get match making report' 
    });
  }
};

module.exports = {
  getMatchMakingReport
};