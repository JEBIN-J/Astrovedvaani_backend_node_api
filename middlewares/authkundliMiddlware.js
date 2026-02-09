const jwtService = require("../utils/jwtService");

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = await jwtService.verifyAccessToken(token);
    req.user = decoded;
  } catch (err) {
    return next(err);
  }
  next();
};
