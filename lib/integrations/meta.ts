/**
 * Meta Conversions API (CAPI) integration.
 * Sends server-side events to Meta — bypasses adblockers 100%.
 * Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
 */
import axios from 'axios';
import { hashEmail } from '@/lib/crypto';
import type { TrackingEvent } from '@/types';

interface MetaConfig {
  pixel_id: string;
  access_token: string;
  test_event_code?: string; // for testing in Meta Events Manager
}

const META_CAPI_URL = 'https://graph.facebook.com/v19.0';

// Map our event names to Meta standard events
const EVENT_MAP: Record<string, string> = {
  page_view:   'PageView',
  scroll_25:   'ViewContent',
  scroll_50:   'ViewContent',
  scroll_75:   'ViewContent',
  scroll_100:  'ViewContent',
  lead:        'Lead',
  purchase:    'Purchase',
};

export async function sendToMeta(
  event: TrackingEvent,
  config: MetaConfig
): Promise<{ success: boolean; response?: unknown; error?: string }> {
  const metaEventName = EVENT_MAP[event.event_name];
  if (!metaEventName) return { success: true }; // skip unknown events

  try {
    const userData: Record<string, unknown> = {
      client_ip_address: event.ip || undefined,
      client_user_agent: event.user_agent || undefined,
    };

    // Hash email if available
    if (event.email) {
      userData.em = [await hashEmail(event.email)];
    }

    // Extract fbc/fbp from properties if stored
    const props = event.properties as Record<string, string>;
    if (props?.fbc) userData.fbc = props.fbc;
    if (props?.fbp) userData.fbp = props.fbp;

    const payload: Record<string, unknown> = {
      data: [
        {
          event_name: metaEventName,
          event_time: Math.floor(new Date(event.created_at).getTime() / 1000),
          event_id: event.id,           // for deduplication with browser pixel
          event_source_url: event.url || undefined,
          action_source: 'website',
          user_data: userData,
          custom_data: event.event_name === 'purchase' ? {
            value: event.value || 0,
            currency: event.currency || 'USD',
            order_id: event.order_id || undefined,
          } : event.event_name.startsWith('scroll') ? {
            content_name: `Scroll ${event.event_name.split('_')[1]}%`,
          } : undefined,
        },
      ],
      access_token: config.access_token,
    };

    // Add test event code if provided (for debugging in Meta Events Manager)
    if (config.test_event_code) {
      payload.test_event_code = config.test_event_code;
    }

    const res = await axios.post(
      `${META_CAPI_URL}/${config.pixel_id}/events`,
      payload
    );

    return { success: true, response: res.data };
  } catch (err: unknown) {
    const error = err as { response?: { data?: unknown }; message?: string };
    return {
      success: false,
      error: JSON.stringify(error.response?.data || error.message),
    };
  }
}
