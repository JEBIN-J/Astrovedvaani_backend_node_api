const Enums = require("../../utils/constants");
const { sendMail } = require("./emailService");
const { generateEmailTemplate } = require("./template/emailTemplate");

const sendWelcomeEmail = async ({ email, name, role }) => {
  let title, message, extraContent, subject;

  if (role === Enums.USER.ROLE.ASTROLOGER) {
    title = `Welcome to astrovedvanni, ${name}!`;
    message = `We’re excited to have you onboard as an astrologer. Through astrovedvanni, you can share your expertise, provide personalized consultations, and earn by helping users on their spiritual journey.`;
    extraContent = `
      <div class="highlight-box">
        <strong>Next Steps:</strong>
        <ul style="margin:8px 0; padding-left:18px;">
          <li>Complete your astrologer profile</li>
          <li>Set your availability and services</li>
          <li>Start connecting with users</li>
        </ul>
      </div>
    `;
    subject = "Welcome to astrovedvanni - Start Your Journey as an Astrologer";
  } else {
    title = `Welcome to astrovedvanni, ${name}!`;
    message = `Your account has been created successfully. With astrovedvanni, you can connect with expert astrologers, get personalized guidance, and explore services tailored for your spiritual growth.`;
    extraContent = `
      <div class="highlight-box">
        <strong>What you can do:</strong>
        <ul style="margin:8px 0; padding-left:18px;">
          <li>Book consultations with astrologers</li>
          <li>Explore personalized horoscopes</li>
          <li>Discover astrology-based services</li>
        </ul>
      </div>
    `;
    subject = "Welcome to astrovedvanni - Explore Your Spiritual Journey";
  }

  const html = generateEmailTemplate({
    title,
    message,
    extraContent,
    footer: "astrovedvanni • Guiding your spiritual journey!",
  });

  await sendMail({
    to: email,
    subject,
    html,
  });
};

module.exports = { sendWelcomeEmail };
