export type EventName =
  | 'page_view'
  | 'scroll_25'
  | 'scroll_50'
  | 'scroll_75'
  | 'scroll_100'
  | 'lead'
  | 'purchase';

export type IntegrationType = 'meta' | 'activecampaign' | 'mailchimp' | 'stripe';

export interface Workspace {
  id: string;
  user_id: string;
  name: string;
  domain: string | null;
  tracking_id: string;
  plan: 'free' | 'pro' | 'enterprise';
  created_at: string;
  updated_at: string;
}

export interface Integration {
  id: string;
  workspace_id: string;
  type: IntegrationType;
  config: Record<string, string>; // encrypted on server
  enabled: boolean;
  last_tested: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrackingEvent {
  id: string;
  workspace_id: string;
  visitor_id: string;
  session_id: string;
  event_name: EventName;
  url: string | null;
  referrer: string | null;
  ip: string | null;
  user_agent: string | null;
  properties: Record<string, unknown>;
  email: string | null;
  value: number | null;
  currency: string | null;
  order_id: string | null;
  verified: boolean;
  verified_by: string | null;
  created_at: string;
}

export interface Visitor {
  id: string;
  workspace_id: string;
  visitor_id: string;
  fingerprint: string | null;
  ip: string | null;
  country: string | null;
  user_agent: string | null;
  email: string | null;
  first_seen: string;
  last_seen: string;
}

// Payload sent by tracker.js to /api/collect
export interface CollectPayload {
  tid: string;           // tracking_id
  event: EventName;
  vid: string;           // visitor_id (cookie)
  sid: string;           // session_id
  url: string;
  ref: string;
  fp: string;            // fingerprint
  email?: string;        // for lead events
  value?: number;        // for purchase events
  currency?: string;
  order_id?: string;
  props?: Record<string, unknown>;
}

// Meta CAPI event
export interface MetaEvent {
  event_name: string;
  event_time: number;
  event_id: string;
  event_source_url: string;
  user_data: {
    client_ip_address?: string;
    client_user_agent?: string;
    em?: string[];        // hashed email
    fbc?: string;         // fb click id
    fbp?: string;         // fb browser id
  };
  custom_data?: {
    value?: number;
    currency?: string;
    order_id?: string;
  };
  action_source: 'website';
}
