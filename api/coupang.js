import crypto from "crypto";

export const config = { runtime: "edge" };

const ACCESS_KEY = process.env.COUPANG_ACCESS_KEY;
const SECRET_KEY = process.env.COUPANG_SECRET_KEY;

// HMAC 서명 생성
function generateHmac(method, url, secretKey, accessKey) {
  const datetime = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const message = datetime + method + url;
  const signature = crypto
    .createHmac("sha256", secretKey)
    .update(message)
    .digest("hex");
  return {
    authorization: `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`,
  };
}

export default async function handler(req) {
  // CORS 헤더
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const { searchParams } = new URL(req.url);
    const endpoint = searchParams.get("endpoint"); // e.g. "revenue", "clicks", "products"
    const startDate = searchParams.get("startDate"); // YYYY-MM-DD
    const endDate = searchParams.get("endDate");

    // 엔드포인트별 쿠팡 API 경로 매핑
    const apiPaths = {
      revenue:  `/v2/providers/affiliate_open_api/apis/openapi/v1/revenue?startDate=${startDate}&endDate=${endDate}`,
      clicks:   `/v2/providers/affiliate_open_api/apis/openapi/v1/clicks?startDate=${startDate}&endDate=${endDate}`,
      products: `/v2/providers/affiliate_open_api/apis/openapi/v1/products?startDate=${startDate}&endDate=${endDate}`,
    };

    const apiPath = apiPaths[endpoint];
    if (!apiPath) {
      return new Response(JSON.stringify({ error: "Unknown endpoint" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { authorization } = generateHmac("GET", apiPath, SECRET_KEY, ACCESS_KEY);

    const coupangRes = await fetch(`https://api-gateway.coupang.com${apiPath}`, {
      method: "GET",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json;charset=UTF-8",
      },
    });

    const data = await coupangRes.json();

    return new Response(JSON.stringify(data), {
      status: coupangRes.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}