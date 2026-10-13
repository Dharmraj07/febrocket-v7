const crypto = require("crypto");
const { Resend } = require("resend");
const config = require("../config");

const resend = config.resendApiKey ? new Resend(config.resendApiKey) : null;

const sendMail = async ({ from = config.mailFrom || "FebRocket <no-reply@example.com>", to, subject, html }) => {
  if (!resend) throw new Error("RESEND_API_KEY is not configured");
  return resend.emails.send({ from, to, subject, html });
};

// ==========================================
// RESEND CONFIGURATION
// ==========================================

const FROM_EMAIL =
  process.env.MAIL_FROM ||
  process.env.FROM_EMAIL ||
  "FebRocket <hello@febrocket.com>";


// ==========================================
// FRONTEND URL
// ==========================================

// Development:
// http://localhost:3000
//
// Production:
// https://yourdomain.com

const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  "http://localhost:3000";


// ==========================================
// REUSABLE EMAIL LAYOUT
// ==========================================

const emailLayout = (content) => `
<!DOCTYPE html>
<html lang="en">

<head>

  <meta charset="UTF-8" />

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  />

</head>


<body
  style="
    margin: 0;
    padding: 0;
    background-color: #f6f7fb;
    font-family: Arial, Helvetica, sans-serif;
    color: #1a1a1a;
  "
>

  <div
    style="
      max-width: 600px;
      margin: 40px auto;
      background: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      border: 1px solid #e9e9ee;
    "
  >

    <!-- HEADER -->

    <div
      style="
        padding: 32px;
        text-align: center;
        border-bottom: 1px solid #eeeeee;
      "
    >

      <h1
        style="
          margin: 0;
          font-size: 26px;
          font-weight: 700;
          color: #111111;
        "
      >
        🚀 FebRocket
      </h1>


      <p
        style="
          margin: 8px 0 0;
          font-size: 14px;
          color: #777777;
        "
      >
        Smart document processing made simple.
      </p>

    </div>


    <!-- CONTENT -->

    <div
      style="
        padding: 36px 32px;
      "
    >

      ${content}

    </div>


    <!-- FOOTER -->

    <div
      style="
        padding: 24px 32px;
        background: #fafafa;
        border-top: 1px solid #eeeeee;
        text-align: center;
      "
    >

      <p
        style="
          margin: 0;
          font-size: 13px;
          color: #888888;
        "
      >
        © ${new Date().getFullYear()} FebRocket.
        All rights reserved.
      </p>


      <p
        style="
          margin: 8px 0 0;
          font-size: 12px;
          color: #aaaaaa;
        "
      >
        This is an automated message. Please do not reply.
      </p>

    </div>

  </div>

</body>

</html>
`;


// ==========================================
// GENERATE OTP
// ==========================================

const generateOtp = () => {
  return {
    otp: crypto.randomInt(100000, 999999).toString(),

    otpExpires:
      Date.now() + 10 * 60 * 1000,
  };
};


// ==========================================
// GENERATE EMAIL VERIFICATION TOKEN
// ==========================================

const generateVerificationToken = () => {
  const token =
    crypto.randomBytes(32).toString("hex");

  const verificationTokenExpires =
    Date.now() + 24 * 60 * 60 * 1000;

  return {
    token,
    verificationTokenExpires,
  };
};


// ==========================================
// SEND PASSWORD RESET OTP EMAIL
// ==========================================

const sendOtpEmail = async (email, otp) => {
  const html = emailLayout(`

    <h2
      style="
        margin-top: 0;
        font-size: 24px;
        color: #111111;
      "
    >
      Reset your password
    </h2>


    <p
      style="
        font-size: 16px;
        line-height: 1.6;
        color: #555555;
      "
    >
      We received a request to reset your
      FebRocket password.
    </p>


    <p
      style="
        font-size: 16px;
        line-height: 1.6;
        color: #555555;
      "
    >
      Use the verification code below:
    </p>


    <!-- OTP BOX -->

    <div
      style="
        margin: 30px 0;
        padding: 22px;
        background: #f5f7fb;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        text-align: center;
      "
    >

      <div
        style="
          font-size: 32px;
          font-weight: 700;
          letter-spacing: 8px;
          color: #111111;
        "
      >
        ${otp}
      </div>

    </div>


    <p
      style="
        font-size: 14px;
        color: #777777;
        line-height: 1.6;
      "
    >
      This code expires in
      <strong>10 minutes</strong>.
    </p>


    <p
      style="
        font-size: 14px;
        color: #777777;
        line-height: 1.6;
      "
    >
      If you didn't request a password reset,
      you can safely ignore this email.
    </p>

  `);


  const response = await sendMail({
    from: FROM_EMAIL,

    to: email,

    subject: "Reset your FebRocket password",

    html,
  });

  return response;
};


// ==========================================
// SEND EMAIL VERIFICATION OTP
// ==========================================

const sendVerificationOtpEmail = async (email, otp) => {
  const html = emailLayout(`
    <h2 style="margin-top: 0; font-size: 24px; color: #111111;">
      Verify your email
    </h2>

    <p style="font-size: 16px; line-height: 1.6; color: #555555;">
      Use the verification code below to activate your FebRocket account:
    </p>

    <div style="margin: 30px 0; padding: 22px; background: #f5f7fb; border: 1px solid #e5e7eb; border-radius: 12px; text-align: center;">
      <div style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #111111;">
        ${otp}
      </div>
    </div>

    <p style="font-size: 14px; color: #777777; line-height: 1.6;">
      This code expires in <strong>10 minutes</strong>.
    </p>
  `);

  return sendMail({
    from: FROM_EMAIL,
    to: email,
    subject: "Verify your FebRocket email",
    html,
  });
};


// ==========================================
// SEND EMAIL VERIFICATION EMAIL
// ==========================================

const sendVerificationEmail = async (
  email,
  token
) => {

  // ========================================
  // FRONTEND VERIFICATION PAGE
  // ========================================

  const verifyUrl =
    `${FRONTEND_URL}/auth/verify-email` +
    `?token=${encodeURIComponent(token)}` +
    `&email=${encodeURIComponent(email)}`;


  const html = emailLayout(`

    <h2
      style="
        margin-top: 0;
        font-size: 24px;
        color: #111111;
      "
    >
      Verify your email ✨
    </h2>


    <p
      style="
        font-size: 16px;
        line-height: 1.6;
        color: #555555;
      "
    >
      Welcome to FebRocket!
    </p>


    <p
      style="
        font-size: 16px;
        line-height: 1.6;
        color: #555555;
      "
    >
      Please verify your email address to activate
      your account and start using FebRocket.
    </p>


    <!-- VERIFY BUTTON -->

    <div
      style="
        text-align: center;
        margin: 32px 0;
      "
    >

      <a
        href="${verifyUrl}"

        style="
          display: inline-block;
          background: #2563eb;
          color: #ffffff;
          text-decoration: none;
          padding: 14px 26px;
          border-radius: 10px;
          font-size: 15px;
          font-weight: 600;
        "
      >
        Verify Email Address →
      </a>

    </div>


    <p
      style="
        font-size: 14px;
        color: #777777;
        line-height: 1.6;
      "
    >
      This verification link expires in
      <strong>24 hours</strong>.
    </p>


    <p
      style="
        font-size: 14px;
        color: #777777;
        line-height: 1.6;
      "
    >
      If you didn't create a FebRocket account,
      you can safely ignore this email.
    </p>


    <!-- FALLBACK URL -->

    <p
      style="
        font-size: 12px;
        color: #999999;
        word-break: break-all;
        line-height: 1.6;
      "
    >
      If the button doesn't work, copy and paste
      this link into your browser:

      <br />
      <br />

      ${verifyUrl}

    </p>

  `);


  const response = await sendMail({
    from: FROM_EMAIL,

    to: email,

    subject: "Verify your email — FebRocket",

    html,
  });

  return response;
};


// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  generateOtp,
  generateVerificationToken,
  sendOtpEmail,
  sendVerificationOtpEmail,
  sendVerificationEmail,
};

// const crypto = require("crypto");
// const { Resend } = require("resend");

// const resend = new Resend(process.env.RESEND_API_KEY);

// const FROM_EMAIL = "FebRocket <hello@febrocket.com>";

// // Reusable email layout
// const emailLayout = (content) => `
// <!DOCTYPE html>
// <html>
// <head>
//   <meta charset="UTF-8" />
//   <meta name="viewport" content="width=device-width, initial-scale=1.0" />
// </head>

// <body style="
//   margin: 0;
//   padding: 0;
//   background-color: #f6f7fb;
//   font-family: Arial, Helvetica, sans-serif;
//   color: #1a1a1a;
// ">

//   <div style="
//     max-width: 600px;
//     margin: 40px auto;
//     background: #ffffff;
//     border-radius: 16px;
//     overflow: hidden;
//     border: 1px solid #e9e9ee;
//   ">

//     <!-- Header -->
//     <div style="
//       padding: 32px;
//       text-align: center;
//       border-bottom: 1px solid #eeeeee;
//     ">
//       <h1 style="
//         margin: 0;
//         font-size: 26px;
//         font-weight: 700;
//         color: #111111;
//       ">
//         🚀 FebRocket
//       </h1>

//       <p style="
//         margin: 8px 0 0;
//         font-size: 14px;
//         color: #777777;
//       ">
//         Make forms faster.
//       </p>
//     </div>

//     <!-- Content -->
//     <div style="
//       padding: 36px 32px;
//     ">
//       ${content}
//     </div>

//     <!-- Footer -->
//     <div style="
//       padding: 24px 32px;
//       background: #fafafa;
//       border-top: 1px solid #eeeeee;
//       text-align: center;
//     ">

//       <p style="
//         margin: 0;
//         font-size: 13px;
//         color: #888888;
//       ">
//         © ${new Date().getFullYear()} FebRocket. All rights reserved.
//       </p>

//       <p style="
//         margin: 8px 0 0;
//         font-size: 12px;
//         color: #aaaaaa;
//       ">
//         This is an automated message. Please do not reply.
//       </p>

//     </div>

//   </div>

// </body>
// </html>
// `;


// // ===============================
// // PASSWORD RESET OTP EMAIL
// // ===============================

// const sendOtpEmail = async (email, otp) => {

//   const html = emailLayout(`

//     <h2 style="
//       margin-top: 0;
//       font-size: 24px;
//       color: #111111;
//     ">
//       Reset your password
//     </h2>

//     <p style="
//       font-size: 16px;
//       line-height: 1.6;
//       color: #555555;
//     ">
//       We received a request to reset your FebRocket password.
//     </p>

//     <p style="
//       font-size: 16px;
//       line-height: 1.6;
//       color: #555555;
//     ">
//       Use the verification code below:
//     </p>

//     <!-- OTP -->
//     <div style="
//       margin: 30px 0;
//       padding: 22px;
//       background: #f5f5f7;
//       border-radius: 12px;
//       text-align: center;
//     ">

//       <div style="
//         font-size: 32px;
//         font-weight: 700;
//         letter-spacing: 8px;
//         color: #111111;
//       ">
//         ${otp}
//       </div>

//     </div>

//     <p style="
//       font-size: 14px;
//       color: #777777;
//       line-height: 1.6;
//     ">
//       This code expires in <strong>10 minutes</strong>.
//     </p>

//     <p style="
//       font-size: 14px;
//       color: #777777;
//       line-height: 1.6;
//     ">
//       If you didn't request a password reset, you can safely ignore this email.
//     </p>

//   `);

//   await resend.emails.send({
//     from: FROM_EMAIL,
//     to: email,
//     subject: "Reset your FebRocket password",
//     html,
//   });
// };


// // ===============================
// // OTP GENERATOR
// // ===============================

// const generateOtp = () => ({
//   otp: crypto.randomInt(100000, 999999).toString(),
//   otpExpires: Date.now() + 10 * 60 * 1000,
// });


// // ===============================
// // EMAIL VERIFICATION TOKEN
// // ===============================

// const generateVerificationToken = () => {

//   const token = crypto.randomBytes(32).toString("hex");

//   const verificationTokenExpires =
//     Date.now() + 24 * 60 * 60 * 1000;

//   return {
//     token,
//     verificationTokenExpires,
//   };
// };


// // ===============================
// // EMAIL VERIFICATION
// // ===============================

// const sendVerificationEmail = async (email, token) => {

//   const baseUrl =
//     process.env.APP_BASE_URL ||
//     `http://localhost:${process.env.PORT || 3000}`;

//   const verifyUrl =
//     `${baseUrl}/api/auth/verify-email?token=${token}&email=${encodeURIComponent(email)}`;

//   const html = emailLayout(`

//     <h2 style="
//       margin-top: 0;
//       font-size: 24px;
//       color: #111111;
//     ">
//       Verify your email ✨
//     </h2>

//     <p style="
//       font-size: 16px;
//       line-height: 1.6;
//       color: #555555;
//     ">
//       Welcome to FebRocket!
//     </p>

//     <p style="
//       font-size: 16px;
//       line-height: 1.6;
//       color: #555555;
//     ">
//       Please verify your email address to activate your account and start using FebRocket.
//     </p>

//     <!-- Button -->
//     <div style="
//       text-align: center;
//       margin: 32px 0;
//     ">

//       <a
//         href="${verifyUrl}"
//         style="
//           display: inline-block;
//           background: #111111;
//           color: #ffffff;
//           text-decoration: none;
//           padding: 14px 26px;
//           border-radius: 10px;
//           font-size: 15px;
//           font-weight: 600;
//         "
//       >
//         Verify Email Address →
//       </a>

//     </div>

//     <p style="
//       font-size: 14px;
//       color: #777777;
//       line-height: 1.6;
//     ">
//       This verification link expires in <strong>24 hours</strong>.
//     </p>

//     <p style="
//       font-size: 13px;
//       color: #999999;
//       word-break: break-all;
//     ">
//       If the button doesn't work, copy and paste this link into your browser:
//       <br /><br />
//       ${verifyUrl}
//     </p>

//   `);

//   await resend.emails.send({
//     from: FROM_EMAIL,
//     to: email,
//     subject: "Verify your email — FebRocket",
//     html,
//   });
// };


// module.exports = {
//   sendOtpEmail,
//   generateOtp,
//   generateVerificationToken,
//   sendVerificationEmail,
// };


// // const crypto = require("crypto");
// // const nodemailer = require("nodemailer");

// // const transporter = nodemailer.createTransport({
// //   service: "Gmail",
// //   auth: {
// //     user: process.env.EMAIL_USER,
// //     pass: process.env.EMAIL_PASS,
// //   },
// // });

// // const sendOtpEmail = async (email, otp) => {
// //   await transporter.sendMail({
// //     to: email,
// //     from: process.env.EMAIL_USER,
// //     subject: "Password Reset OTP",
// //     html: `
// //       <p>Use the following OTP to reset your password:</p>
// //       <h3>${otp}</h3>
// //       <p>This OTP is valid for 10 minutes. If you did not request this, please ignore this email.</p>
// //     `,
// //   });
// // };

// // const generateOtp = () => ({
// //   otp: crypto.randomInt(100000, 999999).toString(),
// //   otpExpires: Date.now() + 10 * 60 * 1000,
// // });

// // const generateVerificationToken = () => {
// //   const token = crypto.randomBytes(32).toString("hex");
// //   const verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000;

// //   return { token, verificationTokenExpires };
// // };

// // const sendVerificationEmail = async (email, token) => {
// //   const baseUrl = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
// //   const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${token}&email=${encodeURIComponent(email)}`;

// //   await transporter.sendMail({
// //     to: email,
// //     from: process.env.EMAIL_USER,
// //     subject: "Please verify your email",
// //     html: `
// //       <p>Click the link below to verify your email address:</p>
// //       <a href="${verifyUrl}">${verifyUrl}</a>
// //       <p>This link is valid for 24 hours.</p>
// //     `,
// //   });
// // };

// // module.exports = {
// //   sendOtpEmail,
// //   generateOtp,
// //   generateVerificationToken,
// //   sendVerificationEmail,
// // };
