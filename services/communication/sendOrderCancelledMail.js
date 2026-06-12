const { sendMail } = require("./emailService");
const { generateEmailTemplate } = require("./template/emailTemplate");

const sendOrderCancelledMail = async ({
  email,
  customerName,
  orderId,
  cancelledDate,
  refundAmount,
}) => {
  const html = generateEmailTemplate({
    title: `Order Cancelled`,

    message: `
      Dear ${customerName},<br/><br/>

      We regret to inform you that your order has been cancelled by the admin/seller team.
    `,

    extraContent: `
      <div class="highlight-box">
        <p><strong>Order ID:</strong> ${orderId}</p>

        <p><strong>Cancelled Date:</strong> ${cancelledDate}</p>

        <p><strong>Refund Amount:</strong> ₹${refundAmount}</p>
      </div>

      <p style="margin-top:20px;">
        Your refund process has been initiated successfully and the amount will be credited to your original payment method within 5-7 working days.
      </p>

      <p>
        If you have any questions, please contact our support team.
      </p>

      <p>
        We sincerely apologize for the inconvenience caused.
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
    subject: "Your Order has been Cancelled",
    html,
  });
};
module.exports = { sendOrderCancelledMail };
