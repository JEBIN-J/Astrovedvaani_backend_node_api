const { sendMail } = require("./emailService");
const { generateEmailTemplate } = require("./template/emailTemplate");

const sendOrderDeliveredMail = async ({
  email,
  customerName,
  orderId,
  deliveryDate,
}) => {
  const html = generateEmailTemplate({
    title: `Order Delivered Successfully`,

    message: `
      Dear ${customerName},<br/><br/>

      Your order has been successfully delivered.
    `,

    extraContent: `
      <div class="highlight-box">
        <p><strong>Order ID:</strong> ${orderId}</p>

        <p><strong>Delivery Date:</strong> ${deliveryDate}</p>
      </div>

      <p style="margin-top:20px;">
        We hope you enjoy your purchase.
        Thank you for choosing Astro vedvaani.
      </p>

      <p>
        Your feedback means a lot to us.
        Feel free to share your experience.
      </p>
    `,

    footer: `
      Regards,<br/>
      Team Astro vedvaani<br/>

      <a href="https://astrovedvaani.com">
        https://astrovedvaani.com
      </a>
    `,
  });

  await sendMail({
    to: email,
    subject: "Your Order has been Delivered",
    html,
  });
};
module.exports = { sendOrderDeliveredMail };
