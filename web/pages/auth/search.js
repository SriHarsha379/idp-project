// web/pages/auth/search.js
import { useState } from "react";
import styles from "../../styles/SearchPage.module.css";

export default function SearchPage() {
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

      if (!res.ok) throw new Error(data.message || "Search failed");

      setResults(data.results || []);
      setMode(data.mode || "");
      setMessage(`Found ${data.count || 0} result(s)`);
    } catch (err) {
      setMessage(`❌ ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={`${styles.container} ${styles.fadeIn}`}>

        <h1 className={styles.title}>🔍 Smart Shipment Search</h1>
        <p className={styles.subtitle}>
          Search LR / Invoice / Truck / Buyer — powered by AI + semantic search
        </p>

        {/* Search Box */}
        <form onSubmit={handleSearch} className={styles.searchBox}>
          <input
            type="text"
            placeholder="Enter invoice, LR number, truck number..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={styles.input}
          />

          <button className={styles.button} disabled={loading}>
            {loading ? "Searching..." : "🔎 Search"}
          </button>
        </form>

        {mode && <p className={styles.mode}>Mode: {mode}</p>}
        {message && <p className={styles.message}>{message}</p>}

        {/* Results Table */}
        {results.length > 0 && (
          <div className={`${styles.tableWrapper} ${styles.slideUp}`}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>LR No</th>
                  <th>Truck</th>
                  <th>Bill To</th>
                  <th>Ship To</th>
                </tr>
              </thead>

              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className={styles.row}>
                    <td>{r.invoice_no || "-"}</td>
                    <td>{r.lr_no || "-"}</td>
                    <td>{r.truck_no || "-"}</td>
                    <td>{r.bill_to_party || "-"}</td>
                    <td>{r.ship_to_party || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
