export const config = { runtime: "edge" };

const ACCESS_KEY = process.env.COUPANG_ACCESS_KEY;
const SECRET_KEY = process.env.COUPANG_SECRET_KEY;

async function generateAuthorization(method, url) {
  const datetime = new Date()
    .toISOString()
    .replace(/\.\d{3}Z/, "Z"); // 밀리초 제거

  // 쿠팡 공식 서명 메시지 형식: datetime + method + path?query
  const message = datetime + method + url;

  const enc = new TextEncoder();
  const keyData = enc.encode(SECRET_KEY);
  const msgData = enc.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyData,
    { name: "HMAC", hash: { name: "SHA-256" } },
    false, ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  const signature = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  return `CEA algorithm=HmacSHA256, access-key=${ACCESS_KEY}, signed-date=${datetime}, signature=${signature}`;
}

export default async function handler(req) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    const { searchParams } = new URL(req.url);
    const endpoint  = searchParams.get("endpoint");
    const startDate = (searchParams.get("startDate") || "").replace(/-/g, "");
    const endDate   = (searchParams.get("endDate") || "").replace(/-/g, "");

    // 쿠팡 공식 API 문서 기준 경로
    const pathMap = {
      clicks:   `/v2/providers/affiliate_open_api/apis/openapi/v1/reports/clicks?startDate=${startDate}&endDate=${endDate}`,
      revenue:  `/v2/providers/affiliate_open_api/apis/openapi/v1/reports/commission?startDate=${startDate}&endDate=${endDate}`,
      products: `/v2/providers/affiliate_open_api/apis/openapi/v1/reports/orders?startDate=${startDate}&endDate=${endDate}`,
    };

    const apiPath = pathMap[endpoint];
    if (!apiPath) {
      return new Response(JSON.stringify({ error: "Unknown endpoint" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const authorization = await generateAuthorization("GET", apiPath);

    const res = await fetch(`https://api-gateway.coupang.com${apiPath}`, {
      method: "GET",
      headers: {
        "Authorization": authorization,
        "Content-Type": "application/json;charset=UTF-8",
      },
    });

    const text = await res.text();

    // 응답 상태와 함께 반환 (디버깅용 status 포함)
    return new Response(text, {
      status: res.status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
}
