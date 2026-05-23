const { sendMail } = require("./emailService");
const { generateEmailTemplate } = require("./template/emailTemplate");

const sendOrderProcessingMail = async ({
  email,
  customerName,
  orderId,
  processingDate,
}) => {
  const html = generateEmailTemplate({
    title: `Order Processing Started 🚀`,

    message: `
      Dear ${customerName},<br/><br/>

      Your order is now under processing and our team is preparing it for shipment.
    `,

    extraContent: `
      <div class="highlight-box">
        <p><strong>Order ID:</strong> ${orderId}</p>

        <p><strong>Processing Date:</strong> ${processingDate}</p>
      </div>

      <p style="margin-top:20px;">
        We are working to dispatch your order as soon as possible.
      </p>
    `,

    footer: `
      Thank you for your patience and for shopping with Astro vedvaani.<br/><br/>

      Regards,<br/>
      Team Astro vedvaani<br/>

      <a href="https://astrovedvaani.com">
        https://astrovedvaani.com
      </a>
    `,
  });

  await sendMail({
    to: email,
    subject: "Your Order is Under Processing",
    html,
  });
};
module.exports = { sendOrderProcessingMail };
