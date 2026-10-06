export function onRequestPost() {
  return new Response(null, { status: 303, headers: { "location": "/login", "set-cookie": "scorecard_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict", "cache-control": "no-store" } });
}
