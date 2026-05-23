const { sendMail } = require("./emailService");
const { generateEmailTemplate } = require("./template/emailTemplate");

const sendOrderPlacedMail = async ({
  email,
  customerName,
  orderId,
  orderDate,
  paymentMethod,
  orderAmount,
}) => {
  const html = generateEmailTemplate({
    title: `Order Received Successfully 🎉`,

    message: `
      Dear ${customerName},<br/><br/>

      Thank you for shopping with Astro vedvaani.<br/><br/>

      Your order has been successfully received and is currently waiting for seller/admin acceptance.
    `,

    extraContent: `
      <div class="highlight-box">
        <p><strong>Order ID:</strong> ${orderId}</p>

        <p><strong>Order Date:</strong> ${orderDate}</p>

        <p><strong>Payment Method:</strong> ${paymentMethod}</p>

        <p><strong>Order Amount:</strong> ₹${orderAmount}</p>
      </div>

      <p style="margin-top:20px;">
        Our team is reviewing your order and you will receive another notification once your order is confirmed.
      </p>
    `,

    footer: `
      Thank you for choosing Astro vedvaani.<br/><br/>

      Regards,<br/>
      Team Astro vedvaani<br/>

      <a href="https://astrovedvaani.com" target="_blank">
      https://astrovedvaani.com
      </a>
    `,
  });

  await sendMail({
    to: email,

    subject: "Your Order has been Successfully Received",

    html,
  });
};

module.exports = {
  sendOrderPlacedMail,
};
