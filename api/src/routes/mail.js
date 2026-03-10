import express from "express";
import nodemailer from "nodemailer";
const router = express.Router();

var transporter = nodemailer.createTransport({
  port: 25,
  tls: {
    rejectUnauthorized: true,
  },
});

router.post("/", async function (req, res, _next) {
  var msg = req.body;
  var textBody =
    "The user with username hash: " +
    msg.username +
    " and password: " +
    msg.password +
    " wishes to register. Their email address, for contact purposes, is: " +
    msg.emailAddress +
    ".";
  var htmlBody =
    "<p>A user wishes to register.</p><p><b>user hash:</b>&nbsp;" +
    msg.username +
    "</p><p><b>password:</b>&nbsp;" +
    msg.password +
    "</p><p><b>email address:</b>&nbsp;" +
    msg.emailAddress +
    "</p>";

  var mailOptions = {
    from: '"FoodOfTheGodsAdmin" <admin@theunderempire.com>',
    to: process.env.REGISTRATION_EMAIL,
    subject: "User Registration Request",
    text: textBody,
    html: htmlBody,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Registration email sent: " + info.response);
    res.json({ success: true, msg: "Registration request sent." });
  } catch (error) {
    console.error("Failed to send registration email:", error);
    res.status(500).json({ success: false, msg: "Failed to send registration request." });
  }
});

export default router;
