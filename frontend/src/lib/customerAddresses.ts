import { resilientFetch } from "@/lib/resilientFetch";

export type CustomerSession = {
  id: string;
  phone_masked: string;
  preferred_name?: string;
  verification_status: string;
};

export type CustomerAddress = {
  id: string;
  tole_locality?: string;
  landmark?: string;
  street?: string;
  house_number?: string;
  postal_code?: string;
  phone?: string;
  delivery_instructions?: string;
  latitude?: number | string;
  longitude?: number | string;
  address_type?: "HOME" | "WORK" | "OTHER";
  is_default?: boolean;
};

export type CustomerAddressInput = Omit<CustomerAddress, "id">;

type ApiError = { error?: string };

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.text();
  if (!body) return {} as T;

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(`Unexpected response (HTTP ${response.status})`);
  }
}

function csrfToken() {
  const value =
    document.cookie.match(/(?:^|; )customer_csrf=([^;]+)/)?.[1] || "";
  return decodeURIComponent(value);
}

export async function loadCustomerSession(): Promise<CustomerSession | null> {
  const response = await resilientFetch("/api/auth/session/validate", {
    credentials: "include",
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 403) return null;

  const result = await readJson<{ customer?: CustomerSession } & ApiError>(
    response,
  );
  if (!response.ok || !result.customer) {
    throw new Error(result.error || "Could not load your account");
  }
  return result.customer;
}

export async function loadCustomerAddresses(
  customerId: string,
): Promise<CustomerAddress[]> {
  const response = await resilientFetch(
    `/api/addresses/customer/${encodeURIComponent(customerId)}`,
    {
      credentials: "include",
      cache: "no-store",
    },
  );
  const result = await readJson<CustomerAddress[] & ApiError>(response);
  if (!response.ok)
    throw new Error(result.error || "Could not load saved addresses");
  return Array.isArray(result) ? result : [];
}

export async function createCustomerAddress(
  input: CustomerAddressInput,
): Promise<CustomerAddress> {
  const response = await resilientFetch("/api/addresses", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrfToken(),
    },
    body: JSON.stringify(input),
  });
  const result = await readJson<CustomerAddress & ApiError>(response);
  if (!response.ok)
    throw new Error(result.error || "Could not save the address");
  return result;
}

export async function deleteCustomerAddress(addressId: string): Promise<void> {
  const response = await resilientFetch(
    `/api/addresses/${encodeURIComponent(addressId)}`,
    {
      method: "DELETE",
      credentials: "include",
      headers: { "x-csrf-token": csrfToken() },
    },
  );
  if (response.ok) return;
  const result = await readJson<ApiError>(response);
  throw new Error(result.error || "Could not remove the address");
}

export function addressSummary(address: CustomerAddress) {
  return [
    address.house_number,
    address.street,
    address.tole_locality,
    address.landmark,
  ]
    .filter(Boolean)
    .join(", ");
}

export function addressMapUrl(address: CustomerAddress) {
  const latitude = Number(address.latitude);
  const longitude = Number(address.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "";
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}
