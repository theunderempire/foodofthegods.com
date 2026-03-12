import bcrypt from "bcrypt";
import crypto from "crypto";
import nodemailer from "nodemailer";

const APPROVAL_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SET_PASSWORD_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function defaultCreateTransporter() {
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const config = {
    host: process.env.SMTP_HOST ?? "localhost",
    port,
    secure: port === 465,
    tls: {
      rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== "false",
    },
  };
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    config.auth = { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS };
  }
  return nodemailer.createTransport(config);
}

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

function appUrl(path) {
  const base = (process.env.APP_URL ?? "https://theunderempire.com/foodofthegods").replace(
    /\/$/,
    "",
  );
  return `${base}${path}`;
}

function apiUrl(path) {
  const base = (process.env.API_URL ?? "https://theunderempire.com/foodofthegods-api").replace(
    /\/$/,
    "",
  );
  return `${base}${path}`;
}

export class MailService {
  constructor(createTransporter = defaultCreateTransporter) {
    this._createTransporter = createTransporter;
  }

  async register(req, res) {
    const { username, email } = req.body;
    if (!username || !email) {
      return res
        .status(400)
        .json({ success: false, data: { message: "Username and email are required." } });
    }

    const pending = req.db.get("pendingUsers");
    const users = req.db.get("users");

    try {
      const existing = await users.findOne({ username });
      if (existing) return res.json({ success: true });

      const alreadyPending = await pending.findOne({ username });
      if (alreadyPending) return res.json({ success: true });

      const approvalToken = generateToken();
      await pending.insert({
        username,
        email,
        status: "pending_approval",
        approvalToken,
        tokenExpiry: new Date(Date.now() + APPROVAL_TTL_MS),
        createdAt: new Date(),
      });

      const approvalLink = apiUrl(`/mail/approve/${approvalToken}`);
      await this._createTransporter().sendMail({
        from: '"Food of the Gods" <admin@theunderempire.com>',
        to: process.env.REGISTRATION_EMAIL,
        subject: "New Registration Request",
        text: `A user wants to register.\n\nEmail: ${email}\nUsername hash: ${username}\n\nApprove: ${approvalLink}`,
        html: `<p>A user wants to register.</p><p><b>Email:</b> ${email}</p><p><b>Username hash:</b> ${username}</p><br><p><a href="${approvalLink}">Approve Registration</a></p><p><small>Link expires in 7 days.</small></p>`,
      });

      console.log(`[mail] registration request from ${email}`);
      res.json({ success: true });
    } catch (error) {
      console.error("[mail] registration error:", error);
      res
        .status(500)
        .json({ success: false, data: { message: "Failed to send registration request." } });
    }
  }

  async approve(req, res) {
    const { token } = req.params;
    const pending = req.db.get("pendingUsers");

    try {
      const record = await pending.findOne({ approvalToken: token, status: "pending_approval" });
      if (!record) {
        return res.status(404).send("Invalid or already-used approval link.");
      }
      if (new Date(record.tokenExpiry) < new Date()) {
        await pending.remove({ _id: record._id });
        return res
          .status(410)
          .send("This approval link has expired. Ask the user to register again.");
      }

      const setPasswordToken = generateToken();
      await pending.update(
        { _id: record._id },
        {
          $set: {
            status: "pending_password",
            approvalToken: null,
            setPasswordToken,
            tokenExpiry: new Date(Date.now() + SET_PASSWORD_TTL_MS),
          },
        },
      );

      const setPasswordLink = appUrl(`/set-password?token=${setPasswordToken}`);
      await this._createTransporter().sendMail({
        from: '"Food of the Gods" <admin@theunderempire.com>',
        to: record.email,
        subject: "Set Your Password — Food of the Gods",
        text: `Your registration has been approved!\n\nClick the link below to set your password (valid for 24 hours):\n\n${setPasswordLink}`,
        html: `<p>Your registration has been approved!</p><p><a href="${setPasswordLink}">Set Your Password</a></p><p><small>This link expires in 24 hours.</small></p>`,
      });

      console.log(`[mail] approved registration for ${record.email}`);
      res.send(`Approved. A password setup email has been sent to ${record.email}.`);
    } catch (error) {
      console.error("[mail] approval error:", error);
      res.status(500).send("Failed to process approval.");
    }
  }

  async setPassword(req, res) {
    const { token, password } = req.body;
    if (!token || !password) {
      return res
        .status(400)
        .json({ success: false, data: { message: "Token and password are required." } });
    }

    const pending = req.db.get("pendingUsers");
    const users = req.db.get("users");

    try {
      const record = await pending.findOne({ setPasswordToken: token, status: "pending_password" });
      if (!record) {
        return res
          .status(404)
          .json({ success: false, data: { message: "Invalid or expired link." } });
      }
      if (new Date(record.tokenExpiry) < new Date()) {
        await pending.remove({ _id: record._id });
        return res
          .status(410)
          .json({
            success: false,
            data: { message: "This link has expired. Please request a new registration." },
          });
      }

      const hashedPassword = await bcrypt.hash(password, 12);

      await users.insert({
        username: record.username,
        password: hashedPassword,
        email: record.email,
        createdAt: new Date(),
      });

      await pending.remove({ _id: record._id });
      console.log(`[mail] account created for ${record.email}`);
      res.json({ success: true });
    } catch (error) {
      console.error("[mail] set-password error:", error);
      res.status(500).json({ success: false, data: { message: "Failed to create account." } });
    }
  }
}
