// services/salarySlipService.js

const ejs = require("ejs");
const path = require("path");
const fs = require("fs");
const puppeteer = require("puppeteer");

const Wallet = require("../models/Wallet");
const User = require("../models/User");
const SalarySlip = require("../models/SalarySlip");
const ConsultationSession = require("../models/ConsultationSession");

const Enums = require("../utils/constants");

const { uploadPDF } = require("../services/user/astromall/InvoiceService");

exports.generateSalarySlipPdf = async ({ userId, month, year }) => {
  // =====================================
  // DUPLICATE CHECK
  // =====================================
  const existingSlip = await SalarySlip.findOne({
    user_id: userId,
    month,
    year,
  });

  if (existingSlip) {
    return {
      success: true,
      salarySlip: existingSlip,
    };
  }

  // =====================================
  // USER
  // =====================================
  const astrologer = await User.findById(userId).lean();

  if (!astrologer) {
    throw new Error("Astrologer not found");
  }

  // =====================================
  // WALLET
  // =====================================
  const wallet = await Wallet.findOne({
    user_id: userId,
  });

  if (!wallet) {
    throw new Error("Wallet not found");
  }

  // =====================================
  // DATE RANGE
  // =====================================
  const startDate = new Date(year, month - 1, 1);

  const endDate = new Date(year, month, 1);

  // =====================================
  // SESSIONS
  // =====================================
  const sessions = await ConsultationSession.find({
    astrologer_user_id: userId,

    status: Enums.SERVICE.STATUS.COMPLETED,

    createdAt: {
      $gte: startDate,
      $lt: endDate,
    },
  })
    .sort({
      createdAt: 1,
    })
    .lean();

  // =====================================
  // CALCULATIONS
  // =====================================
  let totalChatEarnings = 0;

  let totalCallEarnings = 0;

  let totalVideoEarnings = 0;

  let totalChatMinutes = 0;

  let totalCallMinutes = 0;

  let totalVideoMinutes = 0;

  sessions.forEach((session) => {
    // CHAT
    if (session.mode === Enums.SERVICE.TYPE.CHAT) {
      totalChatEarnings += Number(session.astrologer_share_amount || 0);

      totalChatMinutes += Number(session.duration_minutes || 0);
    }

    // CALL
    if (session.mode === Enums.SERVICE.TYPE.CALL) {
      totalCallEarnings += Number(session.astrologer_share_amount || 0);

      totalCallMinutes += Number(session.duration_minutes || 0);
    }

    // VIDEO
    if (session.mode === Enums.SERVICE.TYPE.VIDEO) {
      totalVideoEarnings += Number(session.astrologer_share_amount || 0);

      totalVideoMinutes += Number(session.duration_minutes || 0);
    }
  });

  const totalEarnings =
    totalChatEarnings + totalCallEarnings + totalVideoEarnings;

  const finalPayout = totalEarnings;

  const slipNumber = `SAL-${Date.now()}`;

  // =====================================
  // TEMPLATE PATH
  // =====================================
  const templatePath = path.join(
    __dirname,
    "communication/template/salarySlipTemplate.ejs",
  );

  // =====================================
  // HTML GENERATE
  // =====================================
  const html = await ejs.renderFile(templatePath, {
    astrologer,

    sessions,

    month,

    year,

    totalChatEarnings,

    totalCallEarnings,

    totalVideoEarnings,

    totalChatMinutes,

    totalCallMinutes,

    totalVideoMinutes,

    totalEarnings,

    finalPayout,

    slipNumber,
  });

  // =====================================
  // PDF GENERATE
  // =====================================
  const browser = await puppeteer.launch({
    headless: true,

    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  await page.setContent(html, {
    waitUntil: "networkidle0",
  });

  const pdfBuffer = await page.pdf({
    format: "A4",

    printBackground: true,
  });

  await browser.close();

  // =====================================
  // SAVE TEMP PDF
  // =====================================
  const salaryDir = path.join(__dirname, "salary-slips");

  if (!fs.existsSync(salaryDir)) {
    fs.mkdirSync(salaryDir, {
      recursive: true,
    });
  }

  const fileName = `${slipNumber}.pdf`;

  const pdfPath = path.join(salaryDir, fileName);

  fs.writeFileSync(pdfPath, pdfBuffer);

  // =====================================
  // UPLOAD PDF
  // =====================================
  const uploadedUrl = await uploadPDF(pdfPath);

  // =====================================
  // DELETE LOCAL FILE
  // =====================================
  fs.unlinkSync(pdfPath);

  // =====================================
  // STORE IN DB
  // =====================================
  const salarySlip = await SalarySlip.create({
    user_id: userId,

    month,

    year,

    slip_number: slipNumber,

    total_chat_minutes: totalChatMinutes,

    total_call_minutes: totalCallMinutes,

    total_chat_earnings: totalChatEarnings,

    total_call_earnings: totalCallEarnings,

    total_earnings: totalEarnings,

    final_payout: finalPayout,

    pdf_url: uploadedUrl,
  });

  return {
    success: true,

    salarySlip,
  };
};
