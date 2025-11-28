import { useState } from "react";
import { useRouter } from "next/router";
import styles from "../../styles/VerifyOtpPage.module.css"; // 👈 Import CSS

export default function VerifyOtpPage() {
  const router = useRouter();
  const { email } = router.query;

  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleVerify = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setMessage("❌ Passwords do not match");
      return;
    }

    setLoading(true);
    setMessage("Verifying OTP...");

    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "OTP verification failed");

      setMessage("✅ OTP verified successfully! Redirecting to login...");
      setTimeout(() => router.push("/auth/login"), 2000);
    } catch (err) {
      setMessage(`❌ ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.title}>Verify OTP 🔐</h1>
        <p className={styles.subtitle}>Please enter the 6-digit code sent to your email</p>

        <form onSubmit={handleVerify} className={styles.form}>
          <div className={styles.inputGroup}>
            <input
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              maxLength={6}
              required
              className={styles.input}
            />
            <label className={otp ? styles.filledLabel : styles.label}>Enter 6-digit OTP</label>
          </div>

          <div className={styles.inputGroup}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={styles.input}
            />
            <label className={password ? styles.filledLabel : styles.label}>Set Password</label>
          </div>

          <div className={styles.inputGroup}>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className={styles.input}
            />
            <label className={confirmPassword ? styles.filledLabel : styles.label}>
              Confirm Password
            </label>
          </div>

          <button type="submit" disabled={loading} className={styles.button}>
            {loading ? "Verifying..." : "✅ Verify OTP"}
          </button>
        </form>

        {message && <p className={styles.message}>{message}</p>}

        <p className={styles.footerText}>
          Didn’t get OTP?{" "}
          <a href="/auth/register" className={styles.link}>
            Try again
          </a>
        </p>
      </div>
    </div>
  );
}
