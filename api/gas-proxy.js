export default async function handler(req, res) {
  const GAS_URL = "https://script.google.com/macros/s/AKfycbxBI5ns-YbIOpcBh-GjPmcE1-SKm4XaOgo62CIwQzoiLtIZbePzvSqRwhsMQgr-6NOz/exec";

  // Izinkan preflight request dari browser
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  try {
    const fetchOptions = {
      method: req.method,
      headers: {
        "Content-Type": "application/json"
      },
      body: req.method === "POST" ? JSON.stringify(req.body) : undefined,
      redirect: "follow"
    };

    const response = await fetch(GAS_URL, fetchOptions);
    const text = await response.text();

    // Kadang GAS balikin text, bukan JSON
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { success: false, message: "Invalid JSON from GAS", raw: text };
    }

    // Header CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    res.status(response.status).json(json);
  } catch (err) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(500).json({ success: false, message: "Proxy error", detail: err.message });
  }
}
