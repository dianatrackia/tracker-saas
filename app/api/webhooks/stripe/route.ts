/**
 * POST /api/webhooks/stripe
 * Receives Stripe webhook events for server-side purchase verification.
 * This is the ALTERNATIVE to client-side purchase detection —
 * most reliable because Stripe calls this directly.
 *
 * Configure in Stripe Dashboard: Webhooks → Add endpoint → /api/webhooks/stripe
 * Events to listen: payment_intent.succeeded, checkout.session.completed
 */
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  // We need to identify which workspace this webhook belongs to.
  // The workspace tracking_id should be passed as a metadata field
  // in the Stripe PaymentIntent/Checkout Session.
  // e.g., metadata: { tracker_tid: 'trk_abc123' }

  // For now, we'll verify the webhook signature using the global webhook secret
  // and then match by metadata.
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    const stripe = new Stripe(process.env.STRIPE_WEBHOOK_SECRET!);
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: unknown) {
    const error = err as { message?: string };
    return NextResponse.json({ error: `Webhook verification failed: ${error.message}` }, { status: 400 });
  }

  const supabase = createServiceClient();

  try {
    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object as Stripe.PaymentIntent;
      await handleSuccessfulPayment({
        orderId: pi.id,
        amount: pi.amount / 100, // convert from cents
        currency: pi.currency.toUpperCase(),
        email: pi.receipt_email || null,
        trackerTid: pi.metadata?.tracker_tid || null,
        supabase,
      });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === 'paid') {
        await handleSuccessfulPayment({
          orderId: session.payment_intent as string || session.id,
          amount: (session.amount_total || 0) / 100,
          currency: (session.currency || 'usd').toUpperCase(),
          email: session.customer_email || session.customer_details?.email || null,
          trackerTid: session.metadata?.tracker_tid || null,
          supabase,
        });
      }
    }
  } catch (err) {
    console.error('[stripe-webhook] Processing error:', err);
  }

  return NextResponse.json({ received: true });
}

async function handleSuccessfulPayment({
  orderId,
  amount,
  currency,
  email,
  trackerTid,
  supabase,
}: {
  orderId: string;
  amount: number;
  currency: string;
  email: string | null;
  trackerTid: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
}) {
  // Find workspace by tracking_id (passed in Stripe metadata)
  if (!trackerTid) {
    // Try to match by email if we have a recent pending purchase event
    if (email) {
      const { data: recentEvent } = await supabase
        .from('events')
        .select('id, workspace_id')
        .eq('event_name', 'purchase')
        .eq('email', email)
        .eq('verified', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (recentEvent) {
        await supabase
          .from('events')
          .update({
            verified: true,
            verified_by: 'stripe',
            value: amount,
            currency,
            order_id: orderId,
          })
          .eq('id', recentEvent.id);
        return;
      }
    }
    return;
  }

  // Find workspace
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id')
    .eq('tracking_id', trackerTid)
    .single();

  if (!workspace) return;

  // Create a server-side purchase event (more reliable than client-side)
  const { data: insertedEvent } = await supabase
    .from('events')
    .insert({
      workspace_id: workspace.id,
      visitor_id: email || 'stripe_webhook',
      session_id: `stripe_${orderId}`,
      event_name: 'purchase',
      email,
      value: amount,
      currency,
      order_id: orderId,
      properties: { source: 'stripe_webhook' },
      verified: true,
      verified_by: 'stripe',
    })
    .select()
    .single();

  // Forward to Meta CAPI if configured
  if (insertedEvent) {
    const { data: metaIntegration } = await supabase
      .from('integrations')
      .select('config')
      .eq('workspace_id', workspace.id)
      .eq('type', 'meta')
      .eq('enabled', true)
      .single();

    if (metaIntegration) {
      try {
        const { decrypt } = await import('@/lib/crypto');
        const { sendToMeta } = await import('@/lib/integrations/meta');
        const config = JSON.parse(decrypt(metaIntegration.config.encrypted));
        await sendToMeta(insertedEvent, config);
      } catch (err) {
        console.error('[stripe-webhook] Meta CAPI error:', err);
      }
    }
  }
}
