// services/salarySlip.service.js

const ejs = require("ejs");
const path = require("path");
const fs = require("fs");
const puppeteer = require("puppeteer");

const Wallet = require("../../../models/Wallet");
const WalletLedger = require("../../../models/WalletLedger");
const User = require("../../../models/User");
const SalarySlip = require("../../../models/SalarySlip");

const uploadPDF = require("../invoice/uploadPDF");

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
  // TRANSACTIONS
  // =====================================
  const transactions = await WalletLedger.find({
    wallet_id: wallet._id,

    direction: Enums.TRANSACTION.DIRECTION.CREDIT,

    payment_status: Enums.PAYMENT.STATUS.PAID,

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

  let totalChatMinutes = 0;

  let totalCallMinutes = 0;

  transactions.forEach((txn) => {
    if (txn.related_entity_type === "CHAT") {
      totalChatEarnings += Number(txn.amount || 0);

      totalChatMinutes += Number(txn.minutes || 0);
    }

    if (txn.related_entity_type === "CALL") {
      totalCallEarnings += Number(txn.amount || 0);

      totalCallMinutes += Number(txn.minutes || 0);
    }
  });

  const totalEarnings = totalChatEarnings + totalCallEarnings;

  const finalPayout = totalEarnings;

  const slipNumber = `SAL-${Date.now()}`;

  // =====================================
  // TEMPLATE
  // =====================================
  const templatePath = path.join(
    __dirname,
    "../templates/salarySlipTemplate.ejs",
  );

  const html = await ejs.renderFile(templatePath, {
    astrologer,

    transactions,

    month,

    year,

    totalChatEarnings,

    totalCallEarnings,

    totalChatMinutes,

    totalCallMinutes,

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
  const salaryDir = path.join(__dirname, "../salary-slips");

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
