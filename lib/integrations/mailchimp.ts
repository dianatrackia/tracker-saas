/**
 * Mailchimp integration.
 * - Verifies if an email is subscribed to a list (for lead verification).
 */
import axios from 'axios';
import { hashEmail } from '@/lib/crypto';

interface MailchimpConfig {
  // OAuth-connected
  access_token?: string;
  dc?: string;            // datacenter prefix, e.g. us21
  list_id?: string;
  connection_method?: string;
  // Manual API key
  api_key?: string;       // e.g. abc123-us21
}

function resolveMailchimpAuth(config: MailchimpConfig): { dc: string; authHeader: Record<string, string> } {
  if (config.access_token && config.dc) {
    return {
      dc: config.dc,
      authHeader: { Authorization: `Bearer ${config.access_token}` },
    };
  }
  // Legacy API key auth
  const apiKey = config.api_key || '';
  const dc = apiKey.split('-').pop() || 'us1';
  return {
    dc,
    authHeader: {},   // axios handles Basic auth separately for legacy path
  };
}

function getDatacenter(apiKey: string): string {
  return apiKey.split('-').pop() || 'us1';
}

export async function verifyLeadInMailchimp(
  email: string,
  config: MailchimpConfig
): Promise<{ verified: boolean; member?: unknown; error?: string }> {
  try {
    const listId = config.list_id || '';
    const emailHash = await hashEmail(email);

    let res;
    if (config.access_token && config.dc) {
      const { dc, authHeader } = resolveMailchimpAuth(config);
      res = await axios.get(
        `https://${dc}.api.mailchimp.com/3.0/lists/${listId}/members/${emailHash}`,
        { headers: authHeader }
      );
    } else {
      const dc = getDatacenter(config.api_key || '');
      res = await axios.get(
        `https://${dc}.api.mailchimp.com/3.0/lists/${listId}/members/${emailHash}`,
        { auth: { username: 'anystring', password: config.api_key || '' } }
      );
    }

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
    const listId = config.list_id || '';
    let res;
    if (config.access_token && config.dc) {
      const { dc, authHeader } = resolveMailchimpAuth(config);
      res = await axios.get(
        `https://${dc}.api.mailchimp.com/3.0/lists/${listId}`,
        { headers: authHeader }
      );
    } else {
      const dc = getDatacenter(config.api_key || '');
      res = await axios.get(
        `https://${dc}.api.mailchimp.com/3.0/lists/${listId}`,
        { auth: { username: 'anystring', password: config.api_key || '' } }
      );
    }
    return { success: true, listName: res.data?.name };
  } catch (err: unknown) {
    const error = err as { message?: string };
    return { success: false, error: error.message };
  }
}
