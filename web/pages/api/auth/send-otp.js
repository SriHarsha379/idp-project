// pages/api/auth/send-otp.js
import nodemailer from "nodemailer";
import { Pool } from "pg";

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "cementdb",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "your_password",
});

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ success: false, message: "Use POST method" });

  const { name, email, user_type = "USER", company_name = null } = req.body;
  if (!name || !email)
    return res.status(400).json({ success: false, message: "Name and email required" });

  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      `INSERT INTO users (name, email, user_type, company_name, otp, otp_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email)
       DO UPDATE SET otp=$5, otp_expires_at=$6, updated_at=now()`,
      [name, email, user_type, company_name, otp, otpExpiresAt]
    );

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Cement Portal" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your OTP for Registration",
      html: `
        <div style="font-family: Arial, sans-serif;">
          <h2>OTP Verification</h2>
          <p>Hello <b>${name}</b>,</p>
          <p>Your one-time password is:</p>
          <h1 style="color: #2563eb;">${otp}</h1>
          <p>It is valid for 10 minutes.</p>
        </div>
      `,
    });

    return res.status(200).json({ success: true, message: "OTP sent successfully" });
  } catch (error) {
    console.error("OTP Send Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
}
