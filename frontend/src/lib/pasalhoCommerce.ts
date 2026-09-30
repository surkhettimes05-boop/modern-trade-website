import { mapPasalhoCategory, mapPasalhoProduct, type Product, type StorefrontCategory } from './catalog';

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

export async function commerceRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
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
  if (!response.ok) {
    throw new Error(
      errorMessage(value as ApiEnvelope<unknown>, 'Pasalho commerce request failed'),
    );
  }

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

export function categoryRowsToMap(categories: StorefrontCategory[]) {
  return new Map(categories.map((category) => [category.id, category]));
}
