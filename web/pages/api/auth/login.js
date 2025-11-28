// pages/api/auth/login.js
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

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
    const { email, password } = req.body;

    const result = await pool.query(
      `SELECT id, name, email, password, user_type, company_name, is_verified
       FROM users
       WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Email not found" });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid password" });
    }

    const token = jwt.sign(
      { email: user.email, user_type: user.user_type },
      process.env.JWT_SECRET || "test_secret",
      { expiresIn: "2h" }
    );

    // ✅ Return full user info including company_name
    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      email: user.email,
      name: user.name,
      user_type: user.user_type?.toUpperCase() || "USER",
      company_name: user.company_name || null, // 👈 critical line
    });

  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
}
