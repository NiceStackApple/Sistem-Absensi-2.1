export default async function handler(req, res) {
  const GAS_URL = "https://script.google.com/macros/s/AKfycbxz_PP1PY5DzI9QY62C9jQeA0cLS2lU-zTrgCRqDFGCcYRusL6IU2Q0aHyh0yvs1RWX/exec";

  try {
    const fetchOptions = {
      method: req.method,
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: req.method === "POST" ? JSON.stringify(req.body) : undefined,
      redirect: "follow"
    };

    const response = await fetch(GAS_URL, fetchOptions);
    const text = await response.text();

    // Tambahin header biar browser mau terima
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    res.status(response.status).send(text);
  } catch (err) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(500).json({ success: false, message: "Proxy error", detail: err.message });
  }
}
