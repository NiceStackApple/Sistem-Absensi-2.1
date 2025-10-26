export default async function handler(req, res) {
  const GAS_URL = "https://script.google.com/macros/s/AKfycbzHxT6iLarYPk4kDNUxBf-uUbwk8C6gJUigTQvIABE0WZMYQUgK4hgP7LJruUNttYoX/exec";

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  try {
    // kirim ke GAS dengan format JSON juga
    const fetchOptions = {
      method: req.method,
      headers: { "Content-Type": "application/json" },
      body: req.method === "POST" ? JSON.stringify(req.body) : undefined,
      redirect: "follow"
    };

    const response = await fetch(GAS_URL, fetchOptions);
    const text = await response.text();

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      console.error("Invalid JSON from GAS:", text.slice(0, 100));
      json = { success: false, message: "Invalid JSON from GAS", raw: text };
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    res.status(response.status).json(json);

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
