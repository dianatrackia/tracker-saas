/**
 * Mailchimp integration.
 * - Verifies if an email is subscribed to a list (for lead verification).
 */
import axios from 'axios';
import { hashEmail } from '@/lib/crypto';

interface MailchimpConfig {
  api_key: string;     // e.g. abc123-us21
  list_id: string;     // Audience ID
}

function getDatacenter(apiKey: string): string {
  // API key format: key-dc (e.g. abc123-us21)
  return apiKey.split('-').pop() || 'us1';
}

export async function verifyLeadInMailchimp(
  email: string,
  config: MailchimpConfig
): Promise<{ verified: boolean; member?: unknown; error?: string }> {
  try {
    const dc = getDatacenter(config.api_key);
    const emailHash = await hashEmail(email);

    const res = await axios.get(
      `https://${dc}.api.mailchimp.com/3.0/lists/${config.list_id}/members/${emailHash}`,
      {
        auth: { username: 'anystring', password: config.api_key },
      }
    );

    const status = res.data?.status;
    return {
      verified: status === 'subscribed' || status === 'pending',
      member: res.data,
    };
  } catch (err: unknown) {
    const error = err as { response?: { status?: number }; message?: string };
    if (error.response?.status === 404) {
      return { verified: false }; // not found = not a subscriber
    }
    return { verified: false, error: error.message };
  }
}

export async function addOrUpdateSubscriber(
  email: string,
  config: MailchimpConfig,
  tags: string[] = []
): Promise<{ success: boolean; error?: string }> {
  try {
    const dc = getDatacenter(config.api_key);
    const emailHash = await hashEmail(email);

    await axios.put(
      `https://${dc}.api.mailchimp.com/3.0/lists/${config.list_id}/members/${emailHash}`,
      {
        email_address: email,
        status_if_new: 'subscribed',
        tags: tags.map(t => ({ name: t, status: 'active' })),
      },
      {
        auth: { username: 'anystring', password: config.api_key },
      }
    );

    return { success: true };
  } catch (err: unknown) {
    const error = err as { message?: string };
    return { success: false, error: error.message };
  }
}

export async function testMailchimpConnection(
  config: MailchimpConfig
): Promise<{ success: boolean; listName?: string; error?: string }> {
  try {
    const dc = getDatacenter(config.api_key);
    const res = await axios.get(
      `https://${dc}.api.mailchimp.com/3.0/lists/${config.list_id}`,
      {
        auth: { username: 'anystring', password: config.api_key },
      }
    );
    return { success: true, listName: res.data?.name };
  } catch (err: unknown) {
    const error = err as { message?: string };
    return { success: false, error: error.message };
  }
}
