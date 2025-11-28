import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import styles from "../../styles/UserDashboard.module.css";

import FloatingSearch from "../../components/FloatingSearch";
import FloatingChat from "../../components/FloatingChat";

export default function UserDashboard() {
  const router = useRouter();
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    const storedEmail = sessionStorage.getItem("userEmail");
    const storedName = sessionStorage.getItem("userName");
    const storedCompany = sessionStorage.getItem("companyName");

    if (!storedEmail) {
      router.push("/auth/login");
      return;
    }

    setEmail(storedEmail);
    setName(storedName || storedEmail);
    setCompany(storedCompany || "");
  }, [router]);

  const handleLogout = () => {
    sessionStorage.clear();
    router.push("/auth/login");
  };

  return (
    <div className={styles.page}>

      {/* HEADER */}
      <header className={`${styles.header} ${styles.fadeDown}`}>
        <div>
          <h1 className={styles.title}>📊 Buyer Dashboard</h1>
          <p className={styles.subtitle}>
            Company: <span className={styles.company}>{company}</span>
          </p>
        </div>

        <div className={styles.headerRight}>
          <p className={styles.username}>👤 {name}</p>
          <button onClick={handleLogout} className={styles.logoutBtn}>
            🚪 Logout
          </button>
        </div>
      </header>

      {/* CLEAN EMPTY BODY */}
      <main className={styles.content}>
        <p className={styles.infoText}>
          Use the <strong>Search (🔍)</strong> or <strong>Chat Assistant (💬)</strong> to find your shipment details.
        </p>
      </main>

      {/* Floating Tools */}
      <FloatingSearch />
      <FloatingChat />
    </div>
  );
}
