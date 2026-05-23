const generateEmailTemplate = ({ title, message, footer, extraContent }) => {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <style>
      body {
        font-family: Arial, sans-serif;
        background-color: #f4f4f7;
        margin: 0;
        padding: 0;
        color: #000; /* black text */
      }
      .container {
        max-width: 600px;
        margin: 30px auto;
        background: #ffffff;
        border-radius: 14px;
        overflow: hidden;
        box-shadow: 0 6px 18px rgba(0,0,0,0.1);
      }
      .header {
        background: linear-gradient(135deg, #a43643, rgb(247, 198, 0));
        color: #ffffff;
        text-align: center;
        padding: 25px 20px;
      }
      .header img {
        max-height: 50px;
        margin-bottom: 12px;
      }
      .header h1 {
        margin: 0;
        font-size: 22px;
        font-weight: bold;
      }
      .content {
        padding: 30px 25px;
        font-size: 15px;
        line-height: 1.7;
        color: #000; /* black text */
      }
      .content h2 {
        margin-top: 0;
        font-size: 20px;
        color: #a43643; /* primary color 1 */
      }
      .highlight-box {
        background: rgb(247, 198, 0, 0.2); /* soft yellow background */
        border-left: 4px solid #a43643;
        padding: 14px 18px;
        margin: 20px 0;
        border-radius: 8px;
        font-size: 14px;
        color: #000;
      }
      .footer {
        background: #fafafa;
        text-align: center;
        font-size: 12px;
        color: #777;
        padding: 18px;
        border-top: 1px solid #eee;
      }
      a.button {
        display: inline-block;
        background: #a43643;
        color: #ffffff;
        padding: 12px 24px;
        margin: 20px 0;
        border-radius: 6px;
        text-decoration: none;
        font-weight: bold;
        font-size: 14px;
      }
      a.button:hover {
        background: rgb(247, 198, 0);
        color: #000;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <img src="https://api.astrovedvaani.com/uploads/ved.png" alt="astrovedvanni Logo"/>
        <h1>astrovedvanni</h1>
      </div>
      <div class="content">
        <h2>${title}</h2>
        <p>${message}</p>
        ${extraContent || ""}
        <div class="footer">
          ${
            footer ||
            "This is an automated message from astrovedvanni. Please do not reply."
          }
        </div>
      </div>
    </div>
  </body>
  </html>
  `;
};

module.exports = { generateEmailTemplate };
