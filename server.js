require("dotenv").config({
  path:
    process.env.NODE_ENV === "production" ? ".env.production" : ".env.local",
});

// const { initPhonePeClient } = require("./config/phonepeClient");
const ThirdPartyIntegration = require("./models/ThirdPartyIntegration");
const Enums = require("./utils/constants");
const redisClient = require("./utils/redis/redisClient");

try {
  const logger = require("./utils/logger");
  logger.info("Bootstrapping astrovedvanni backend...");
  const app = require("./app");
  const socket = require("./config/socket");
  const PORT = process.env.PORT || 5000;
  const ENV = process.env.NODE_ENV || "development";
  (async () => {
    try {
      await redisClient.connect();
      logger.info("Redis connection established at startup");
      const phonepeIntegration = await ThirdPartyIntegration.findOne({
        provider: Enums.INTEGRATION.PROVIDER.PHONEPAY,
        type: Enums.INTEGRATION.TYPE.PAYMENT,
        is_active: true,
      });

      if (phonepeIntegration) {
        initPhonePeClient(phonepeIntegration);
        logger.info("[Startup] PhonePe SDK client initialized successfully");
      } else {
        logger.warn("[Startup] No active PhonePe integration found");
      }
    } catch (err) {
      logger.error("Failed to initialize PhonePe SDK:", err);
    }
  })();

  const server = app
    .listen(PORT, () => {
      logger.info(`Server running on port ${PORT} in ${ENV} mode`);
    })
    .on("error", (err) => {
      logger.error("Server failed to start:", err);
      console.error("Server startup error:", err);
      process.exit(1);
    });

  try {
    socket.initialize(server);
    logger.info("Socket.IO initialized successfully");
  } catch (err) {
    logger.error("Socket.IO initialization failed:", err);
    console.error("Socket.IO error:", err);
  }

  process.on("unhandledRejection", (err) => {
    logger.error(`Unhandled Rejection: ${err.message}`, err);
    console.error("Unhandled rejection:", err);
  });

  process.on("uncaughtException", (err) => {
    logger.error(`Uncaught Exception: ${err.message}`, err);
    console.error("Uncaught exception:", err);
    process.exit(1);
  });
} catch (err) {
  console.error("Critical Startup Error:", err);
  process.exit(1);
}
