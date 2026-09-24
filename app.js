const express = require("express");
const connectDB = require("./config/db");
const corsMiddleware = require("./config/cors");
const logger = require("./utils/logger");
const routes = require("./routes");
const runSeeder = require("./seeder");
const { getHomeInfo } = require("./services/home/homeService");
const { getHealthStatus } = require("./services/home/healthService");
const errorHandler = require("./middlewares/errorHandler");
const bodyParser = require("body-parser");

const walletController = require("./controller/user/walletController");
// const { apiLimiter, authLimiter } = require("./config/rateLimiter");

require("./utils/firebase");
const app = express();
app.set("trust proxy", 1);
require("./schedule/notificationWorker");
require("./schedule/astrologerActivity");
app.use(express.static(__dirname + "/public"));
// server.js

const { startSalarySlipCron } = require("./services/salarySlipService");

startSalarySlipCron();

const initializeDB = async () => {
  try {
    await connectDB();
    logger.info("MongoDB connected successfully");
    await runSeeder();
  } catch (err) {
    logger.error("MongoDB connection failed:", err);
    process.exit(1);
  }
};
initializeDB();
app.use(corsMiddleware);
app.post(
  "/api/payment/webhook/razorpay",
  bodyParser.raw({ type: "application/json" }),
  walletController.razorpayWebhook,
);
app.post(
  "/api/payment/webhook/phonepe",
  bodyParser.raw({ type: "*/*" }),
  walletController.phonepeWebhook,
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});
// app.use("/api", apiLimiter);
// app.use("/api/auth", authLimiter);
app.use("/api", routes);

app.get("/", async (req, res) => {
  const result = await getHomeInfo();
  const statusCode = result.success ? 200 : 500;
  res.status(statusCode).json(result);
});

app.get("/api/health", async (req, res) => {
  const result = await getHealthStatus();
  const statusCode = result.success ? 200 : 500;
  res.status(statusCode).json(result);
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Not Found" });
});
app.use(errorHandler);

module.exports = app;
