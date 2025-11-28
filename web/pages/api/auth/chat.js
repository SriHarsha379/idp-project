export default async function handler(req, res) {
  try {
    const { query } = req.body;

    const api = "http://127.0.0.1:5000/api/chat";
    const r = await fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          company: req.headers.company || req.body.company || ""
        })


    const data = await r.json();

    return res.status(200).json({
      reply: data.reply || "No response from AI."
    });

  } catch (err) {
    return res.status(500).json({
      reply: "⚠️ AI server error: " + String(err)
    });
  }
}
