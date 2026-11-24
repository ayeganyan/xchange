// Deploy to an HTTPS host supporting Fetch API handlers and environment bindings.
export default {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response(null, { status: 405 });
    if (request.headers.get("Origin") !== env.EXTENSION_ORIGIN || !env.EXTENSION_ORIGIN) {
      return new Response(null, { status: 403 });
    }
    const data = await request.json().catch(() => null);
    if (typeof data?.clientId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.clientId)) {
      return new Response(null, { status: 400 });
    }
    if (!env.GA4_MEASUREMENT_ID || !env.GA4_API_SECRET) {
      return new Response("Missing GA4 Worker configuration", { status: 503 });
    }
    const validate = new URL(request.url).pathname === "/validate";
    // Two 32-bit segments keep the GA4 ID stable across conversions.
    const first = Number.parseInt(data.clientId.slice(0, 8), 16);
    const last = Number.parseInt(data.clientId.slice(-8), 16);
    const url = new URL(validate ? "/debug/mp/collect" : "/mp/collect", "https://www.google-analytics.com");
    url.searchParams.set("measurement_id", env.GA4_MEASUREMENT_ID);
    url.searchParams.set("api_secret", env.GA4_API_SECRET);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: `${first}.${last}`,
        events: [{
          name: "conversion_shown",
          ...(env.GA4_DEBUG === "true" && {
            params: { debug_mode: true, engagement_time_msec: 1 }
          })
        }],
        ...(validate && { validation_behavior: "ENFORCE_RECOMMENDATIONS" })
      })
    });
    if (!response.ok) return new Response(null, { status: 502 });
    if (validate) {
      const { validationMessages } = await response.json();
      return Response.json({ validationMessages });
    }
    return new Response(null, { status: 204 });
  }
};
