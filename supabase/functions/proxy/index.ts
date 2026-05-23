// Supabase Edge Function: proxy/index.ts
// Secure streaming API proxy to route LLM/AI completions (including SSE streams) and bypass CORS
// Deploy: supabase functions deploy proxy

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  // Handle CORS pre-flight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Only POST requests are allowed." }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const payload = await req.json();
    const { url: targetUrl, headers = {}, body } = payload;

    if (!targetUrl || typeof targetUrl !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'url' field in request body." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[proxy] Forwarding request to: ${targetUrl}`);

    // Set up request options for fetch
    const requestOptions: RequestInit = {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Content-Type": "application/json",
        ...headers,
      },
    };

    if (body) {
      requestOptions.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    const response = await fetch(targetUrl, requestOptions);

    // Forward status, statusText, and target headers while adding CORS
    const responseHeaders = new Headers();
    for (const [key, value] of response.headers.entries()) {
      // Avoid duplicating or overriding CORS headers
      if (!key.toLowerCase().startsWith("access-control-")) {
        responseHeaders.set(key, value);
      }
    }
    
    // Add CORS headers explicitly
    for (const [key, value] of Object.entries(corsHeaders)) {
      responseHeaders.set(key, value);
    }

    // Return the response directly as a stream if possible
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (err: any) {
    console.error("[proxy] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Proxy request failed." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
