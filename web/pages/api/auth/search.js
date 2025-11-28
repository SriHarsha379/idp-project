export default async function handler(req, res) {
  try {
    let { q } = req.query;

    if (q) {
      q = q.replace(/^"+|"+$/g, "").trim();
      q = q.replace(/^'+|'+$/g, "").trim();
    }

    const query = q || "";

    // 🔥 New semantic search endpoint
    const api = `http://127.0.0.1:5000/api/semantic-search?q=${encodeURIComponent(
      query
    )}`;

    console.log("[NEXT] Calling:", api);

    const r = await fetch(api);
    const data = await r.json();

    return res.status(200).json({
      mode: data.mode,       // keyword / vector / vector+rerank
      count: data.count || 0,
      results: data.results || [],
      raw: data,
    });
  } catch (err) {
    return res.status(200).json({
      mode: "error",
      count: 0,
      results: [],
      _error: String(err),
    });
  }
}
