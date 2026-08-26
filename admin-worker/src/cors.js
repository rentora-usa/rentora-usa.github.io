export function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const wildcard = env.ALLOWED_ORIGIN === "*";
  const allowed = wildcard || origin === env.ALLOWED_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed ? (wildcard ? "*" : origin) : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin"
  };
}

export function json(data, status, request, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(request, env) }
  });
}
