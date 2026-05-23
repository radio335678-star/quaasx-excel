// Supabase Edge Function: embed/index.ts
// Generates 384-dim text embeddings using the built-in gte-small model (free, runs on the edge)
// Deploy: supabase functions deploy embed

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // Handle CORS pre-flight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { text } = await req.json();

    if (!text || typeof text !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'text' field in request body." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use Supabase's built-in, free, edge-native ONNX pipeline (gte-small = 384 dims)
    // @ts-ignore - Supabase.ai is available in the edge runtime
    const model = new Supabase.ai.Session("gte-small");
    const embedding = await model.run(text, { mean_pool: true, normalize: true });

    return new Response(
      JSON.stringify({ embedding: Array.from(embedding) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[embed] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Unknown error generating embedding." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
