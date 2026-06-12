const { sendMail } = require("./emailService");
const { generateEmailTemplate } = require("./template/emailTemplate");

const sendOrderAcceptedMail = async ({
  email,
  customerName,
  orderId,
  orderDate,
  orderAmount,
}) => {
  const html = generateEmailTemplate({
    title: `Order Accepted Successfully`,

    message: `
      Dear ${customerName},<br/><br/>

      Great news! Your order has been accepted and successfully placed.
    `,

    extraContent: `
      <div class="highlight-box">
        <p><strong>Order ID:</strong> ${orderId}</p>

        <p><strong>Order Date:</strong> ${orderDate}</p>

        <p><strong>Order Amount:</strong> ₹${orderAmount}</p>
      </div>

      <p style="margin-top:20px;">
        Your order is now being prepared for processing.
        We will notify you once the processing begins.
      </p>
    `,

    footer: `
      Thank you for shopping with Astro vedvaani.<br/><br/>

      Regards,<br/>
      Team Astro vedvaani<br/>

      <a href="https://astrovedvaani.com" target="_blank">
        https://astrovedvaani.com
      </a>
    `,
  });

  await sendMail({
    to: email,

    subject: "Your Order has been Accepted",

    html,
  });
};

module.exports = {
  sendOrderAcceptedMail,
};
