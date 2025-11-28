import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function POST(req) {
  try {
    const { name, email, password, user_type = "USER", company_name = null } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json(
        { success: false, message: "All fields are required" },
        { status: 400 }
      );
    }

    // Check for duplicate emails
    const existing = await pool.query("SELECT 1 FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return NextResponse.json(
        { success: false, message: "Email already registered. Try to login." },
        { status: 409 }
      );
    }

    // ✅ Insert user including company_name
    await pool.query(
      `INSERT INTO users (name, email, password, user_type, company_name, is_verified, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, false, now(), now())`,
      [name, email, password, user_type, company_name]
    );

    return NextResponse.json(
      { success: true, message: "Registration successful" },
      { status: 201 }
    );
  } catch (error) {
    console.error("Register Error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
