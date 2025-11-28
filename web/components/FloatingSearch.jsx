import { useState } from "react";
import styles from "../styles/FloatingSearch.module.css";

export default function FloatingSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [mode, setMode] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setMessage("Searching...");
    setResults([]);

    try {
      const res = await fetch(`/api/auth/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();

      setResults(data.results || []);
      setMode(data.mode || "");
      setMessage(`Found ${data.count || 0} result(s)`);
    } catch (err) {
      setMessage("❌ " + err.message);
    }

    setLoading(false);
  };

  return (
    <>
      {/* Floating Button */}
      <button className={styles.floatingBtn} onClick={() => setOpen(true)}>
        🔍
      </button>

      {/* Sliding Search Panel */}
      {open && (
        <div className={styles.overlay}>
          <div className={styles.panel}>
            <div className={styles.header}>
              <h2>🔍 Smart Search</h2>
              <button className={styles.closeBtn} onClick={() => setOpen(false)}>✖</button>
            </div>

            <form onSubmit={handleSearch} className={styles.searchBox}>
              <input
                type="text"
                placeholder="Invoice / LR / Vehicle / Buyer ..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button disabled={loading}>
                {loading ? "Searching..." : "Search"}
              </button>
            </form>

            {mode && <p className={styles.mode}>Mode: {mode}</p>}
            {message && <p className={styles.message}>{message}</p>}

            {results.length > 0 && (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>LR</th>
                    <th>Truck</th>
                    <th>Bill To</th>
                    <th>Ship To</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i}>
                      <td>{r.invoice_no || "-"}</td>
                      <td>{r.lr_no || "-"}</td>
                      <td>{r.truck_no || "-"}</td>
                      <td>{r.bill_to_party || "-"}</td>
                      <td>{r.ship_to_party || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </>
  );
}
