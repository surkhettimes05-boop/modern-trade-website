import { resilientFetch } from './resilientFetch';

export type StorefrontEvent =
  | 'PRODUCT_VIEWED'
  | 'SEARCH'
  | 'CATEGORY_VIEWED'
  | 'ADD_TO_CART'
  | 'REMOVE_FROM_CART'
  | 'OFFER_VIEWED'
  | 'COUPON_APPLIED'
  | 'LOYALTY_POINTS_VIEWED'
  | 'LOYALTY_POINTS_REDEEMED'
  | 'CHECKOUT_STARTED'
  | 'ORDER_COMPLETED'
  | 'REORDER_CLICKED';

export function trackStorefrontEvent(
  event_type: StorefrontEvent,
  event_data: Record<string, unknown> = {},
) {
  void resilientFetch('/api/public/analytics/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_type, event_data }),
    timeoutMs: 3000,
  }).catch(() => undefined);
}