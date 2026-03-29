const crypto = require("crypto");
const https  = require("https");
const zlib   = require("zlib");

const ACCESS_KEY = process.env.COUPANG_ACCESS_KEY;
const SECRET_KEY = process.env.COUPANG_SECRET_KEY;

function generateHmac(method, path, query) {
  const datetime = new Date().toISOString().substr(2, 17)
    .replace(/:/gi, "").replace(/-/gi, "") + "Z";
  const message = datetime + method + path + (query || "");
  const signature = crypto.createHmac("sha256", SECRET_KEY).update(message).digest("hex");
  const authorization = `CEA algorithm=HmacSHA256, access-key=${ACCESS_KEY}, signed-date=${datetime}, signature=${signature}`;
  return { authorization };
}

function httpsGet(path, query) {
  return new Promise((resolve) => {
    const { authorization } = generateHmac("GET", path, query || "");
    const fullPath = query ? `${path}?${query}` : path;
    const options = {
      hostname: "api-gateway.coupang.com",
      path: fullPath, method: "GET",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json;charset=UTF-8",
        "Accept-Encoding": "gzip, deflate"
      }
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        const enc = res.headers["content-encoding"];
        const parse = (text) => {
          try { resolve({ status: res.statusCode, body: JSON.parse(text) }); }
          catch { resolve({ status: res.statusCode, body: { raw: text } }); }
        };
        if (enc === "gzip") zlib.gunzip(buf, (e, d) => e ? resolve({ status: 500, body: {} }) : parse(d.toString("utf-8")));
        else parse(buf.toString("utf-8"));
      });
    });
    req.on("error", () => resolve({ status: 500, body: {} }));
    req.end();
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  const { endpoint, startDate, endDate } = req.query;
  const start = (startDate || "").replace(/-/g, "");
  const end   = (endDate   || "").replace(/-/g, "");

  const pathMap = {
    clicks:   { path: "/v2/providers/affiliate_open_api/apis/openapi/v1/reports/clicks",     query: `startDate=${start}&endDate=${end}` },
    revenue:  { path: "/v2/providers/affiliate_open_api/apis/openapi/v1/reports/commission", query: `startDate=${start}&endDate=${end}` },
    products: { path: "/v2/providers/affiliate_open_api/apis/openapi/v1/reports/orders",     query: `startDate=${start}&endDate=${end}` },
  };

  const target = pathMap[endpoint];
  if (!target) return res.status(400).json({ error: "Unknown endpoint" });

  const result = await httpsGet(target.path, target.query);
  return res.status(result.status).json(result.body);
}
