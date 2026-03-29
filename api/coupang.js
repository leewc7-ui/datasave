import crypto from "node:crypto";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const { endpoint, startDate, endDate } = req.query;
    const start = (startDate || "").replace(/-/g, "");
    const end   = (endDate   || "").replace(/-/g, "");

    const ACCESS_KEY = process.env.COUPANG_ACCESS_KEY;
    const SECRET_KEY = process.env.COUPANG_SECRET_KEY;

    const pathMap = {
      clicks:   `/v2/providers/affiliate_open_api/apis/openapi/v1/reports/clicks?startDate=${start}&endDate=${end}`,
      revenue:  `/v2/providers/affiliate_open_api/apis/openapi/v1/reports/commission?startDate=${start}&endDate=${end}`,
      products: `/v2/providers/affiliate_open_api/apis/openapi/v1/reports/orders?startDate=${start}&endDate=${end}`,
    };

    const apiPath = pathMap[endpoint];
    if (!apiPath) return res.status(400).json({ error: "Unknown endpoint" });

    // HMAC 서명 생성
    const datetime = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const message = datetime + "GET" + apiPath;
    const signature = crypto
      .createHmac("sha256", SECRET_KEY)
      .update(message)
      .digest("hex");

    const authorization = `CEA algorithm=HmacSHA256, access-key=${ACCESS_KEY}, signed-date=${datetime}, signature=${signature}`;

    const response = await fetch(`https://api-gateway.coupang.com${apiPath}`, {
      method: "GET",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json;charset=UTF-8",
      },
    });

    const data = await response.json();
    return res.status(response.status).json(data);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
