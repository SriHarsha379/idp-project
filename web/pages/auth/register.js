import { useState } from "react";
import { useRouter } from "next/router";
import styles from "../../styles/RegisterPage.module.css"; // 👈 Import the CSS module

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    user_type: "USER",
    company_name: "",
  });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("Sending OTP...");

    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to send OTP");

      setMessage("✅ OTP sent to your email!");
      setTimeout(() => {
        router.push(`/auth/verify-otp?email=${form.email}`);
      }, 1500);
    } catch (err) {
      setMessage(`❌ ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.title}>Create Your Account 🚀</h1>
        <p className={styles.subtitle}>Join our platform in a few simple steps</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.inputGroup}>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              className={styles.input}
            />
            <label className={form.name ? styles.filledLabel : styles.label}>Full Name</label>
          </div>

          <div className={styles.inputGroup}>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
              className={styles.input}
            />
            <label className={form.email ? styles.filledLabel : styles.label}>Email</label>
          </div>

          <div className={styles.radioGroup}>
            <label>
              <input
                type="radio"
                name="user_type"
                value="USER"
                checked={form.user_type === "USER"}
                onChange={handleChange}
              />
              Buyer / User
            </label>
            <label>
              <input
                type="radio"
                name="user_type"
                value="ADMIN"
                checked={form.user_type === "ADMIN"}
                onChange={handleChange}
              />
              Admin
            </label>
          </div>

          {form.user_type === "USER" && (
            <div className={styles.inputGroup}>
              <input
                type="text"
                name="company_name"
                value={form.company_name}
                onChange={handleChange}
                required
                className={styles.input}
              />
              <label
                className={form.company_name ? styles.filledLabel : styles.label}
              >
                Company Name
              </label>
            </div>
          )}

          <button type="submit" disabled={loading} className={styles.button}>
            {loading ? "Sending OTP..." : "📩 Send OTP"}
          </button>
        </form>

        {message && <p className={styles.message}>{message}</p>}

        <p className={styles.footerText}>
          Already registered?{" "}
          <a href="/auth/login" className={styles.link}>
            Login
          </a>
        </p>
      </div>
    </div>
  );
}
