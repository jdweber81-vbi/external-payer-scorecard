const encoder = new TextEncoder();
const SESSION_SECONDS = 12 * 60 * 60;

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sign(payload, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload))));
}

function equal(a, b) {
  const left = encoder.encode(a || "");
  const right = encoder.encode(b || "");
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index++) difference |= (left[index] || 0) ^ (right[index] || 0);
  return difference === 0;
}

export async function onRequestPost(context) {
  const configuredCode = context.env.SCORECARD_ACCESS_CODE || "";
  const form = await context.request.formData();
  const submittedCode = String(form.get("accessCode") || "");
  if (!configuredCode) return new Response("Access code is not configured in Cloudflare.", { status: 503 });
  if (!equal(submittedCode, configuredCode)) {
    return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Access denied</title><style>body{font:16px Segoe UI,Arial;background:#f3f6fa;color:#14233b;display:grid;place-items:center;min-height:100vh;margin:0}.box{background:white;padding:32px;border-radius:16px;box-shadow:0 16px 50px #1232;max-width:420px}a{display:inline-block;margin-top:15px;color:#005eb8;font-weight:700}</style><div class="box"><h1>Incorrect access code</h1><p>The code was not accepted. Please try again.</p><a href="/login">Return to sign in</a></div>`, { status: 401, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  }
  const payload = `v1_${Math.floor(Date.now() / 1000) + SESSION_SECONDS}`;
  const token = `${payload}.${await sign(payload, configuredCode)}`;
  return new Response(null, { status: 303, headers: { "location": "/", "set-cookie": `scorecard_session=${token}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`, "cache-control": "no-store" } });
}
