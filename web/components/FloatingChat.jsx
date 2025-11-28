import { useState, useRef, useEffect } from "react";
import styles from "../styles/FloatingChat.module.css";

export default function FloatingChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Hello 👋 How can I help you today?" }
  ]);
  const [loading, setLoading] = useState(false);

  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg = { role: "user", text: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
const res = await fetch("/api/auth/chat", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "company": sessionStorage.getItem("companyName") || ""
  },
  body: JSON.stringify({
    query,
    company: sessionStorage.getItem("companyName") || ""
  })
});


      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: data.reply || "Error: No reply" }
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "⚠️ Error contacting AI server." }
      ]);
    }

    setLoading(false);
  };

  return (
    <>
      {/* Floating Chat Button */}
      <button className={styles.chatButton} onClick={() => setOpen(true)}>
        💬
      </button>

      {/* Overlay */}
      {open && (
        <div className={styles.overlay}>
          {/* Chat Panel */}
          <div className={styles.chatPanel}>
            <div className={styles.header}>
              <h2>AI Assistant</h2>
              <button className={styles.closeBtn} onClick={() => setOpen(false)}>
                ✖
              </button>
            </div>

            {/* Chat Messages */}
            <div className={styles.messages}>
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={
                    m.role === "user"
                      ? styles.userBubble
                      : styles.assistantBubble
                  }
                >
                  {m.text}
                </div>
              ))}
              <div ref={chatEndRef}></div>

              {loading && (
                <div className={styles.assistantBubble}>Typing...</div>
              )}
            </div>

            {/* Chat Input */}
            <form onSubmit={sendMessage} className={styles.inputArea}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask something..."
              />
              <button disabled={loading}>
                {loading ? "..." : "Send"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
