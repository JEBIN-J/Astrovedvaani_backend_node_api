const { sendMail } = require("./emailService");
const { generateEmailTemplate } = require("./template/emailTemplate");

const sendOrderShippedMail = async ({
  email,
  customerName,
  orderId,
  deliveryDate,
}) => {
  const html = generateEmailTemplate({
    title: `Order Shipped Successfully 📦`,

    message: `
      Dear ${customerName},<br/><br/>

      Good news! Your order has been shipped successfully.
    `,

    extraContent: `
      <div class="highlight-box">
        <p><strong>Order ID:</strong> ${orderId}</p>

        <p><strong>Estimated Delivery Date:</strong> ${deliveryDate}</p>
      </div>

      <p style="margin-top:20px;">
        You can track your shipment using the tracking ID provided above.
      </p>
    `,

    footer: `
      Thank you for shopping with Astro vedvaani.<br/><br/>

      Regards,<br/>
      Team Astro vedvaani<br/>

      <a href="https://astrovedvaani.com">
        https://astrovedvaani.com
      </a>
    `,
  });

  await sendMail({
    to: email,
    subject: "Your Order has been Shipped",
    html,
  });
};

module.exports = { sendOrderShippedMail };
