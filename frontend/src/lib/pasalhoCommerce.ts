import {
  mapPasalhoCategory,
  mapPasalhoProduct,
  type Product,
  type StorefrontCategory,
} from './catalog';

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: string | { code?: string; message?: string; details?: unknown };
  message?: string;
};

function errorMessage(value: ApiEnvelope<unknown>, fallback: string) {
  if (typeof value.error === 'string') return value.error;
  if (value.error && typeof value.error === 'object' && value.error.message) {
    return value.error.message;
  }
  return value.message || fallback;
}

async function requestOnce<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ response: Response; value: ApiEnvelope<T> | T }> {
  const response = await fetch(`/api/commerce/${path.replace(/^\/+/, '')}`, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
    cache: 'no-store',
  });

  const value = (await response.json().catch(() => ({}))) as ApiEnvelope<T> | T;
  return { response, value };
}

function unwrap<T>(value: ApiEnvelope<T> | T): T {
  if (
    value &&
    typeof value === 'object' &&
    'success' in value &&
    (value as ApiEnvelope<T>).success === true &&
    'data' in value
  ) {
    return (value as ApiEnvelope<T>).data as T;
  }
  return value as T;
}

export async function commerceRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let result = await requestOnce<T>(path, init);

  const authPath = path.startsWith('auth/');
  if (result.response.status === 401 && !authPath) {
    const refreshed = await requestOnce<unknown>('auth/refresh', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    if (refreshed.response.ok) {
      result = await requestOnce<T>(path, init);
    }
  }

  if (!result.response.ok) {
    throw new Error(
      errorMessage(
        result.value as ApiEnvelope<unknown>,
        result.response.status === 401
          ? 'Sign in to continue.'
          : 'Pasalho commerce request failed',
      ),
    );
  }

  return unwrap(result.value);
}

export type DeliveryContext = {
  latitude: number;
  longitude: number;
  serviceZoneId: string;
  serviceZoneName: string;
  locationId: string;
  branchId: string;
  storeName: string;
  etaMinMinutes: number;
  etaMaxMinutes: number;
  deliveryFee: number;
  freeDeliveryThreshold: number | null;
  minOrder: number;
};

type ServiceabilityResponse = {
  serviceable: boolean;
  reason?: string;
  serviceZone?: { id: string; code: string; name: string };
  fulfillment?: {
    locationId: string;
    branchId: string;
    storeName: string;
    branchName: string;
  };
  delivery?: {
    etaMinMinutes: number;
    etaMaxMinutes: number;
    deliveryFee: number;
    freeDeliveryThreshold: number | null;
    minOrder: number;
  };
};

export async function resolveDeliveryLocation(
  latitude: number,
  longitude: number,
): Promise<DeliveryContext> {
  const result = await commerceRequest<ServiceabilityResponse>(
    'serviceability/resolve',
    {
      method: 'POST',
      body: JSON.stringify({ latitude, longitude }),
    },
  );

  if (
    !result.serviceable ||
    !result.serviceZone ||
    !result.fulfillment ||
    !result.delivery
  ) {
    throw new Error(
      result.reason === 'FULFILLMENT_LOCATION_UNAVAILABLE'
        ? 'A Pasalho store is not available for this location yet.'
        : 'Pasalho delivery is not available at this location yet.',
    );
  }

  return {
    latitude,
    longitude,
    serviceZoneId: result.serviceZone.id,
    serviceZoneName: result.serviceZone.name,
    locationId: result.fulfillment.locationId,
    branchId: result.fulfillment.branchId,
    storeName: result.fulfillment.storeName,
    etaMinMinutes: result.delivery.etaMinMinutes,
    etaMaxMinutes: result.delivery.etaMaxMinutes,
    deliveryFee: result.delivery.deliveryFee,
    freeDeliveryThreshold: result.delivery.freeDeliveryThreshold,
    minOrder: result.delivery.minOrder,
  };
}

export async function fetchPasalhoCatalog(locationId: string) {
  const [categoryRows, productPage] = await Promise.all([
    commerceRequest<Record<string, unknown>[]>(
      `categories?locationId=${encodeURIComponent(locationId)}`,
    ),
    commerceRequest<{
      items: Record<string, unknown>[];
      total: number;
      page: number;
      limit: number;
    }>(
      `products?locationId=${encodeURIComponent(locationId)}&page=1&limit=60`,
    ),
  ]);

  return {
    categories: categoryRows.map(mapPasalhoCategory),
    products: productPage.items.map(mapPasalhoProduct),
    total: productPage.total,
  };
}

export async function searchPasalhoCatalog(
  locationId: string,
  query: string,
): Promise<Product[]> {
  const page = await commerceRequest<{
    items: Record<string, unknown>[];
    total: number;
  }>(
    `search?locationId=${encodeURIComponent(locationId)}&q=${encodeURIComponent(query)}&page=1&limit=12`,
  );
  return page.items.map(mapPasalhoProduct);
}

export type ServerCartItem = {
  id: string;
  productId: string;
  unitId: string;
  quantity: number;
  product: {
    id: string;
    name: string;
    skuCode: string;
    imageUrl?: string | null;
  };
  unit?: { id: string; symbol: string; name: string };
  price?: { sellingPrice: number; mrp: number };
  availability?: { state: string; maxOrderQuantity: number };
  lineTotal?: number;
  unavailable?: boolean;
};

export type ServerCart = {
  id: string;
  cartToken: string;
  inventoryLocationId: string;
  serviceZoneId: string | null;
  status: string;
  items: ServerCartItem[];
  subtotal: number;
  discountTotal: number;
  deliveryFee: number;
  grandTotal: number;
  changes: Array<Record<string, unknown>>;
  checkoutAllowed: boolean;
};

export async function createServerCart(context: DeliveryContext) {
  return commerceRequest<ServerCart>('carts', {
    method: 'POST',
    body: JSON.stringify({
      inventoryLocationId: context.locationId,
      serviceZoneId: context.serviceZoneId,
    }),
  });
}

export async function fetchServerCart(cartToken: string) {
  return commerceRequest<ServerCart>(`carts/${encodeURIComponent(cartToken)}`);
}

export async function addServerCartItem(
  cartToken: string,
  product: Product,
  quantity: number,
) {
  if (!product.defaultUnitId) {
    throw new Error('This product does not have an orderable unit.');
  }
  return commerceRequest<ServerCart>(
    `carts/${encodeURIComponent(cartToken)}/items`,
    {
      method: 'POST',
      body: JSON.stringify({
        productId: product.id,
        unitId: product.defaultUnitId,
        quantity,
      }),
    },
  );
}

export async function updateServerCartItem(
  cartToken: string,
  cartItemId: string,
  quantity: number,
) {
  return commerceRequest<ServerCart>(
    `carts/${encodeURIComponent(cartToken)}/items/${encodeURIComponent(cartItemId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    },
  );
}

export async function removeServerCartItem(
  cartToken: string,
  cartItemId: string,
) {
  return commerceRequest<ServerCart>(
    `carts/${encodeURIComponent(cartToken)}/items/${encodeURIComponent(cartItemId)}`,
    { method: 'DELETE' },
  );
}

export type Customer = {
  id: string;
  phone: string;
  fullName?: string | null;
  email?: string | null;
};

export type CustomerAddress = {
  id: string;
  label: 'HOME' | 'WORK' | 'OTHER';
  customLabel?: string | null;
  recipientName?: string | null;
  phone?: string | null;
  province?: string | null;
  district?: string | null;
  municipality?: string | null;
  ward?: string | null;
  area: string;
  street?: string | null;
  landmark?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  instructions?: string | null;
  isDefault: boolean;
};

export async function requestCustomerOtp(phone: string) {
  return commerceRequest<{ challengeId: string; expiresInSeconds: number }>(
    'auth/request-otp',
    { method: 'POST', body: JSON.stringify({ phone }) },
  );
}

export async function verifyCustomerOtp(
  challengeId: string,
  phone: string,
  otp: string,
) {
  return commerceRequest<{ customer: Customer }>('auth/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ challengeId, phone, otp }),
  });
}

export async function getCustomer() {
  return commerceRequest<Customer>('me');
}

export async function logoutCustomer() {
  return commerceRequest<{ message: string }>('auth/logout', { method: 'POST' });
}

export async function listCustomerAddresses() {
  return commerceRequest<CustomerAddress[]>('me/addresses');
}

export async function createCustomerAddress(
  address: Omit<CustomerAddress, 'id' | 'isDefault'> & { isDefault?: boolean },
) {
  return commerceRequest<CustomerAddress>('me/addresses', {
    method: 'POST',
    body: JSON.stringify(address),
  });
}

export type CheckoutPreview = {
  fulfillmentLocationId: string;
  serviceZoneId: string;
  items: Array<Record<string, unknown>>;
  subtotal: number;
  discountTotal: number;
  deliveryFee: number;
  handlingFee: number;
  grandTotal: number;
  etaMinMinutes: number;
  etaMaxMinutes: number;
  paymentMethod: 'COD';
  checkoutToken: string;
};

export async function previewCheckout(cartToken: string, addressId: string) {
  return commerceRequest<CheckoutPreview>('checkout/preview', {
    method: 'POST',
    body: JSON.stringify({
      cartToken,
      addressId,
      paymentMethod: 'COD',
    }),
  });
}

export async function placeOrder(
  cartToken: string,
  addressId: string,
  checkoutToken: string,
  idempotencyKey: string,
) {
  return commerceRequest<{
    id: string;
    orderNo: string;
    status: string;
    grandTotal: number | string;
  }>('orders', {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey },
    body: JSON.stringify({
      cartToken,
      addressId,
      paymentMethod: 'COD',
      checkoutToken,
    }),
  });
}

export type CustomerOrder = {
  id: string;
  orderNo: string;
  status: string;
  grandTotal: number | string;
  createdAt: string;
  placedAt?: string | null;
  cancelledAt?: string | null;
  fulfillmentLocation?: { id: string; name: string } | null;
  items?: Array<{
    id: string;
    quantity: number | string;
    lineTotal: number | string;
    product: { id: string; name: string; imageUrl?: string | null };
    unit?: { symbol?: string; name?: string };
  }>;
  statusEvents?: Array<{
    id: string;
    fromStatus?: string | null;
    toStatus: string;
    createdAt: string;
    note?: string | null;
  }>;
};

export async function listCustomerOrders() {
  return commerceRequest<{
    items: CustomerOrder[];
    total: number;
    page: number;
    limit: number;
  }>('orders?page=1&limit=30');
}

export async function getCustomerOrder(id: string) {
  return commerceRequest<CustomerOrder>(`orders/${encodeURIComponent(id)}`);
}

export async function cancelCustomerOrder(id: string, reason: string) {
  return commerceRequest<{ id: string; orderNo: string; status: string }>(
    `orders/${encodeURIComponent(id)}/cancel`,
    {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ reason }),
    },
  );
}

export function categoryRowsToMap(categories: StorefrontCategory[]) {
  return new Map(categories.map((category) => [category.id, category]));
}
