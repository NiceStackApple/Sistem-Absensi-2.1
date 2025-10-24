export default async function handler(req, res) {
  const GAS_URL = "https://script.google.com/macros/s/AKfycbyche7LtzkByLyTQ7x5WC9CLVPFLj4J8hDZ6-oobOoMIKH-npnrwbEi_9lNRTv8F5cr/exec";

  // --- Handle preflight request ---
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  try {
    // --- Forward ke Google Apps Script ---
    const fetchOptions = {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // bukan application/json
      body: JSON.stringify(req.body),
      redirect: "follow"
    };

    const response = await fetch(GAS_URL, fetchOptions);
    const text = await response.text();

    // --- Paksa JSON parsing aman ---
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      console.error("Invalid JSON from GAS:", text.slice(0, 100));
      json = { success: false, message: "Invalid JSON from GAS", raw: text };
    }

    // --- Tambahkan header CORS ---
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    // --- Kirim hasil JSON yang pasti valid ---
    res.status(200).json(json);

  } catch (err) {
    console.error("Proxy Error:", err);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(500).json({
      success: false,
      message: "Proxy error saat menghubungi Apps Script",
      detail: err.message
    });
  }
}
