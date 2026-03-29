export const config = { runtime: "edge" };

const ACCESS_KEY = process.env.COUPANG_ACCESS_KEY;
const SECRET_KEY = process.env.COUPANG_SECRET_KEY;

// Web Crypto API로 HMAC 서명 생성
async function generateHmac(method, path) {
  const datetime = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const message = datetime + method + path;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(SECRET_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const hex = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  return {
    authorization: `CEA algorithm=HmacSHA256, access-key=${ACCESS_KEY}, signed-date=${datetime}, signature=${hex}`,
  };
}

export default async function handler(req) {
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
    const endpoint  = searchParams.get("endpoint");
    const startDate = searchParams.get("startDate");
    const endDate   = searchParams.get("endDate");

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

    const { authorization } = await generateHmac("GET", apiPath);

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
