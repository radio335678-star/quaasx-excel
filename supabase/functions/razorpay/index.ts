// Supabase Edge Function: razorpay/index.ts
// Secure webhook handler for Razorpay subscription events (verifies signature, updates user profiles with service role client)
// Deploy: supabase functions deploy razorpay

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// HMAC-SHA256 Signature Verification Helper
async function verifyRazorpaySignature(body: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(body);

  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign("HMAC", key, messageData);
  const signatureArray = Array.from(new Uint8Array(signatureBuffer));
  const expectedSignature = signatureArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return expectedSignature === signature;
}

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
    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature");
    const webhookSecret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");

    console.log("[razorpay-webhook] Received payment notification webhook");

    // 1. Signature Verification
    if (webhookSecret) {
      if (!signature) {
        console.error("[razorpay-webhook] Missing x-razorpay-signature header");
        return new Response(
          JSON.stringify({ error: "Missing x-razorpay-signature header" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      const isValid = await verifyRazorpaySignature(rawBody, signature, webhookSecret);
      if (!isValid) {
        console.error("[razorpay-webhook] Invalid signature verification failed");
        return new Response(
          JSON.stringify({ error: "Invalid signature" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.log("[razorpay-webhook] Signature verified successfully.");
    } else {
      console.warn("[razorpay-webhook] RAZORPAY_WEBHOOK_SECRET is not configured. Skipping signature verification in dev mode.");
    }

    // 2. Parse Event Payload
    const payload = JSON.parse(rawBody);
    const event = payload.event;
    console.log(`[razorpay-webhook] Processing event: ${event}`);

    // Create Supabase Service Role client to bypass RLS policies for updates
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[razorpay-webhook] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
      return new Response(
        JSON.stringify({ error: "Database connection credentials missing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 3. Extract Metadata and Parameters
    // Razorpay puts order/payment notes in the entity
    const paymentEntity = payload.payload?.payment?.entity;
    const subscriptionEntity = payload.payload?.subscription?.entity;
    
    const notes = {
      ...(paymentEntity?.notes || {}),
      ...(subscriptionEntity?.notes || {})
    };

    let userId = notes.user_id || notes.userId || notes.user_uuid;
    let userEmail = notes.email || paymentEntity?.email || subscriptionEntity?.email;
    let targetPlan = notes.plan || notes.subscription_plan || "pro"; // Default to 'pro' if not specified

    // If userId was not passed in notes, try to find user by email
    if (!userId && userEmail) {
      console.log(`[razorpay-webhook] No user_id in notes. Searching for user by email: ${userEmail}`);
      const { data: userData, error: userError } = await supabase.auth.admin.listUsers();
        
      if (userData && !userError) {
        const foundUser = userData.users.find(u => u.email?.toLowerCase() === userEmail.toLowerCase());
        if (foundUser) {
          userId = foundUser.id;
          console.log(`[razorpay-webhook] Found user ID from email: ${userId}`);
        }
      }
    }

    if (!userId) {
      console.error("[razorpay-webhook] Could not determine user ID for this payment notification. Notes: ", notes);
      return new Response(
        JSON.stringify({ error: "Could not resolve user_id from payload notes or email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Act on Events
    // Event list: order.paid, payment.captured, subscription.charged, subscription.activated, subscription.cancelled, subscription.halted
    if (
      event === "subscription.charged" || 
      event === "subscription.activated" || 
      event === "payment.captured" || 
      event === "order.paid"
    ) {
      console.log(`[razorpay-webhook] Upgrading user ${userId} to subscription plan: ${targetPlan}`);
      
      const { data, error } = await supabase
        .from("user_profiles")
        .upsert({
          user_id: userId,
          subscription_plan: targetPlan,
          tokens_used: 0, // Reset token counters on subscription activation/renewal
          updated_at: new Date().toISOString()
        })
        .select();

      if (error) {
        console.error(`[razorpay-webhook] Error updating profile for user ${userId}:`, error);
        return new Response(
          JSON.stringify({ error: `Profile update failed: ${error.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      console.log(`[razorpay-webhook] Successfully upgraded user ${userId} to ${targetPlan}.`, data);
    } else if (
      event === "subscription.cancelled" || 
      event === "subscription.halted" || 
      event === "subscription.expired"
    ) {
      console.log(`[razorpay-webhook] Downgrading user ${userId} to free tier due to subscription cancel/expiration.`);
      
      const { data, error } = await supabase
        .from("user_profiles")
        .upsert({
          user_id: userId,
          subscription_plan: "free",
          updated_at: new Date().toISOString()
        })
        .select();

      if (error) {
        console.error(`[razorpay-webhook] Error downgrading profile for user ${userId}:`, error);
        return new Response(
          JSON.stringify({ error: `Profile downgrade failed: ${error.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      console.log(`[razorpay-webhook] Successfully downgraded user ${userId} to free.`, data);
    } else {
      console.log(`[razorpay-webhook] Event ${event} is not a state-changing event. Ignoring.`);
    }

    return new Response(
      JSON.stringify({ success: true, message: `Processed ${event} successfully` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[razorpay-webhook] Server error processing webhook:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
