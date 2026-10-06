const encoder = new TextEncoder();
const COOKIE_NAME = "scorecard_session";

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signature(payload, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload))));
}

async function validSession(request, secret) {
  if (!secret) return false;
  const cookies = request.headers.get("cookie") || "";
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return false;
  const [payload, suppliedSignature] = match[1].split(".");
  const parts = payload?.split("_");
  if (!payload || !suppliedSignature || parts?.[0] !== "v1" || Number(parts[1]) < Math.floor(Date.now() / 1000)) return false;
  return suppliedSignature === await signature(payload, secret);
}

export async function onRequest(context) {
  const path = new URL(context.request.url).pathname;
  if (path === "/login" || path === "/login.html" || path === "/auth/login") return context.next();
  if (await validSession(context.request, context.env.SCORECARD_ACCESS_CODE)) return context.next();
  return Response.redirect(new URL("/login", context.request.url).toString(), 302);
}
