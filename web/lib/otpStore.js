// web/lib/otpStore.js
// Simple in-memory OTP store for dev use
// NOTE: This resets when the Next.js server restarts.

const otpStore = new Map();

/**
 * Save OTP for an email
 */
export function setOtp(email, code) {
  otpStore.set(email, {
    code,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Verify OTP for an email
 */
export function verifyOtp(email, code) {
  const entry = otpStore.get(email);
  if (!entry) return { ok: false, reason: "No OTP requested" };

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(email);
    return { ok: false, reason: "OTP expired" };
  }

  if (entry.code !== code) {
    return { ok: false, reason: "Invalid OTP" };
  }

  otpStore.delete(email);
  return { ok: true };
}
