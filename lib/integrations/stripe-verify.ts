/**
 * Stripe integration — purchase verification.
 * Verifies that a purchase with a given order_id actually exists in Stripe.
 */
import Stripe from 'stripe';

interface StripeConfig {
  secret_key: string;
  webhook_secret: string;
}

export async function verifyPurchaseInStripe(
  orderId: string,
  config: StripeConfig
): Promise<{ verified: boolean; charge?: Stripe.Charge | Stripe.PaymentIntent; error?: string }> {
  try {
    const stripe = new Stripe(config.secret_key);

    // Try as PaymentIntent first
    try {
      const pi = await stripe.paymentIntents.retrieve(orderId);
      if (pi.status === 'succeeded') {
        return { verified: true, charge: pi };
      }
      return { verified: false };
    } catch {
      // Not a PaymentIntent, try as Charge
    }

    // Try as Charge
    try {
      const charge = await stripe.charges.retrieve(orderId);
      if (charge.paid && !charge.refunded) {
        return { verified: true, charge };
      }
      return { verified: false };
    } catch {
      return { verified: false, error: 'Order not found in Stripe' };
    }
  } catch (err: unknown) {
    const error = err as { message?: string };
    return { verified: false, error: error.message };
  }
}

export async function testStripeConnection(
  config: StripeConfig
): Promise<{ success: boolean; accountName?: string; error?: string }> {
  try {
    const stripe = new Stripe(config.secret_key);
    const account = await stripe.accounts.retrieve();
    return { success: true, accountName: account.business_profile?.name || account.email || undefined };
  } catch (err: unknown) {
    const error = err as { message?: string };
    return { success: false, error: error.message };
  }
}
