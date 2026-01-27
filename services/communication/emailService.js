const logger = require("../../utils/logger");
const { createTransporter, getEmailIntegration } = require("./emailIntegrationService");

const sendMail = async ({ to, subject, html }) => {
  try {
    const integration = await getEmailIntegration();
    if (!integration) {
      throw new Error("No active email integration configured");
    }
    const transporter = createTransporter(integration);
    await transporter.sendMail({
      from: `"${integration.extra_config?.from_name || "Support"}" <${integration.extra_config?.from_email}>`,
      to,
      subject,
      html,
    });
    logger.info({
      message: "Email sent successfully",
      to,
      subject,
      from: integration.extra_config?.from_email,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({
      message: "Email send failed",
      error: err.message,
      stack: err.stack,
      to,
      subject,
      timestamp: new Date().toISOString(),
    });
  }
};
module.exports = { sendMail };