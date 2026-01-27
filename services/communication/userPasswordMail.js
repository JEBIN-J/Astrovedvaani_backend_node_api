const { sendMail } = require("./emailService");
const { generateEmailTemplate } = require("./template/emailTemplate");

const sendUserPassword = async ({ email, password, name }) => {
  const html = generateEmailTemplate({
    title: `Welcome ${name}!`,
    message: `Your account has been created successfully. Please use the temporary password below to log in and make sure to change it after your first login.`,
    extraContent: `
      <div class="highlight-box">
        <strong>Temporary Password:</strong> ${password}
      </div>
    `,
    footer: "astrovedvanni • Guiding your spiritual journey!",
  });

  await sendMail({
    to: email,
    subject: "Your astrovedvanni Account Credentials",
    html,
  });
};

module.exports = { sendUserPassword };
