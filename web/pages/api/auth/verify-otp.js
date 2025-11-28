// pages/api/auth/verify-otp.js
import { Pool } from "pg";
import bcrypt from "bcryptjs";

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "cementdb",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "your_password",
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    const { email, otp, password } = req.body;
    console.log("Incoming verify OTP payload:", { email, otp, password });

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: "Email and OTP required" });
    }

    const result = await pool.query("SELECT * FROM users WHERE email=$1", [email]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Email not found" });
    }

    const user = result.rows[0];

    // Check OTP validity
    if (user.otp !== otp) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    if (new Date(user.otp_expires_at) < new Date()) {
      return res.status(400).json({ success: false, message: "OTP expired" });
    }

    // Hash the password before storing
    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      `UPDATE users
       SET is_verified = true,
           otp = null,
           otp_expires_at = null,
           password = $1,
           updated_at = NOW()
       WHERE email = $2`,
      [hashedPassword, email]
    );

    return res.status(200).json({
      success: true,
      message: "OTP verified and password set successfully!",
    });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
}
