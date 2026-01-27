const { generateEmailTemplate } = require("./template/emailTemplate");

/**
 * OTP Email Format
 */
const getOtpEmailHtml = ({ name, otp }) => {
  const title = `Reset Your Password`;
  const message = `Hi ${name || ""}, use the OTP below to continue.`;

  const extraContent = `
    <div style="
      margin-top: 18px;
      padding: 12px;
      background: #f5f6fa;
      border-radius: 6px;
      text-align: center;
      font-size: 22px;
      font-weight: bold;
      letter-spacing: 2px;
      color: #2d98da;
    ">
      ${otp}
    </div>

    <p style="margin-top: 12px; font-size: 14px; color: #444;">
      This OTP is valid for 10 minutes.<br/>
      Please do not share it with anyone.
    </p>
  `;

  return generateEmailTemplate({
    title,
    message,
    extraContent,
    footer: "astrovedvanni • Secure login to your spiritual journey",
  });
};

module.exports = { getOtpEmailHtml };
