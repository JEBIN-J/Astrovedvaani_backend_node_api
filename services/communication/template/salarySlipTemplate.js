// services/salarySlip.service.js

const ejs = require("ejs");
const path = require("path");
const fs = require("fs");
const puppeteer = require("puppeteer");

const Wallet = require("../../../models/Wallet");
const WalletLedger = require("../../../models/Ledger");
const User = require("../../../models/User");
const SalarySlip = require("../../../models/SalarySlip");
const Enums = require("../../../utils/constants");

const uploadPDF =
  require("../../../services/communication/template/invoiceTemplate").uploadPDF;
const ConsultationSession = require("../../../models/ConsultationSession");
exports.generateSalarySlipPdf = async ({ userId, month, year }) => {
  const existingSlip = await SalarySlip.findOne({
    user_id: userId,
    month,
    year,
  });
  console.log("Existing slip:", existingSlip ? existingSlip._id : "NOT FOUND");
  if (existingSlip) {
    return {
      success: true,
      salarySlip: existingSlip,
    };
  }

  const astrologer = await User.findById(userId).lean();

  if (!astrologer) {
    throw new Error("Astrologer not found");
  }

  const wallet = await Wallet.findOne({
    user_id: userId,
  });

  if (!wallet) {
    throw new Error("Wallet not found");
  }

  const startDate = new Date(year, month - 1, 1);

  const endDate = new Date(year, month, 1);

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

  const sessions = await ConsultationSession.find({
    astrologer_user_id: userId,

    status: Enums.SERVICE.STATUS.COMPLETED,

    payment_status: Enums.PAYMENT.STATUS.PAID,

    start_time: {
      $gte: startDate,
      $lt: endDate,
    },
  }).lean();

  let totalChatEarnings = 0;
  let totalCallEarnings = 0;
  let totalVideoEarnings = 0;

  let totalChatMinutes = 0;
  let totalCallMinutes = 0;
  let totalVideoMinutes = 0;

  sessions.forEach((session) => {
    const earning = Number(session.astrologer_share_amount || 0);
    const minutes = Number(session.duration_minutes || 0);

    switch (session.mode) {
      case Enums.SERVICE.TYPE.CHAT:
        totalChatEarnings += earning;
        totalChatMinutes += minutes;
        break;

      case Enums.SERVICE.TYPE.CALL:
        totalCallEarnings += earning;
        totalCallMinutes += minutes;
        break;

      case Enums.SERVICE.TYPE.VIDEO:
        totalVideoEarnings += earning;
        totalVideoMinutes += minutes;
        break;

      default:
        break;
    }
  });

  const totalEarnings =
    totalChatEarnings + totalCallEarnings + totalVideoEarnings;

  const finalPayout = totalEarnings;

  const slipNumber = `SAL-${Date.now()}`;

  const templatePath = path.join(
    __dirname,
    "../template/salarySlipTemplate.ejs",
  );
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

  const salaryDir = path.join(__dirname, "../salary-slips");

  if (!fs.existsSync(salaryDir)) {
    fs.mkdirSync(salaryDir, {
      recursive: true,
    });
  }

  const fileName = `${slipNumber}.pdf`;

  const pdfPath = path.join(salaryDir, fileName);

  fs.writeFileSync(pdfPath, pdfBuffer);

  const uploadedUrl = await uploadPDF(pdfPath);

  fs.unlinkSync(pdfPath);

  let salarySlip;

  try {
    salarySlip = await SalarySlip.create({
      user_id: userId,

      month,
      year,

      slip_number: slipNumber,

      total_chat_minutes: totalChatMinutes,
      total_call_minutes: totalCallMinutes,
      total_video_minutes: totalVideoMinutes,

      total_chat_earnings: totalChatEarnings,
      total_call_earnings: totalCallEarnings,
      total_video_earnings: totalVideoEarnings,

      total_earnings: totalEarnings,
      final_payout: finalPayout,

      pdf_url: uploadedUrl,
    });
  } catch (err) {
    if (err.code === 11000) {
      salarySlip = await SalarySlip.findOne({
        user_id: userId,
        month,
        year,
      });
    } else {
      throw err;
    }
  }

  return {
    success: true,
    salarySlip,
  };
};
