import { useState } from "react";
import { useRouter } from "next/router";
import styles from "../../styles/LoginPage.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("Logging in...");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Login failed");

      // Save session info
      sessionStorage.setItem("userEmail", data.email);
      sessionStorage.setItem("userName", data.name);
      sessionStorage.setItem("userType", data.user_type);
      sessionStorage.setItem("companyName", data.company_name);

      setMessage("✨ Login successful! Redirecting...");

      setTimeout(() => {
        router.push(data.user_type === "ADMIN" ? "/dashboard/admin" : "/dashboard/user");
      }, 700);
    } catch (err) {
      setMessage(`❌ ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>📦</div>

        <h1 className={styles.title}>Welcome Back</h1>
        <p className={styles.subtitle}>Login to continue</p>

        <form onSubmit={handleLogin} className={styles.form}>
          <div className={styles.inputGroup}>
            <label>Email</label>
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className={styles.inputGroup}>
            <label>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" disabled={loading} className={styles.button}>
            {loading ? "Processing..." : "🔐 Login"}
          </button>
        </form>

        {message && <p className={styles.message}>{message}</p>}

        <p className={styles.footerText}>
          New user?{" "}
          <a href="/auth/register" className={styles.link}>
            Create an account
          </a>
        </p>
      </div>
    </div>
  );
}
