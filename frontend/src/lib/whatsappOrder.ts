import type { Product } from "@/lib/catalog";

export const WHATSAPP_ORDER_NUMBER = "9779822403262";
export const WHATSAPP_ORDER_DISPLAY_NUMBER = "+977 9822403262";

export type WhatsAppOrderItem = {
  product: Pick<Product, "id" | "name" | "price" | "sku" | "unit">;
  qty: number;
};

export type WhatsAppOrderDetails = {
  reference: string;
  customerName: string;
  phone: string;
  address: string;
  mapUrl?: string;
  notes?: string;
  items: WhatsAppOrderItem[];
  subtotal: number;
};

export type RememberedWhatsAppDetails = {
  version: 1;
  customerName: string;
  phone: string;
  address: string;
  mapUrl: string;
};

export const REMEMBERED_DETAILS_KEY = "novamart-whatsapp-details:v1";

const nepaliPhonePattern = /^(?:\+?977[- ]?)?(?:9[678]\d{8})$/;

export function normalizeNepaliPhone(value: string) {
  return value.replace(/[\s()-]/g, "");
}

export function isValidNepaliMobile(value: string) {
  return nepaliPhonePattern.test(normalizeNepaliPhone(value));
}

export function createWhatsAppReference(now = new Date()) {
  const date = [
    String(now.getFullYear()).slice(-2),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const suffix = crypto
    .randomUUID()
    .replaceAll("-", "")
    .slice(0, 6)
    .toUpperCase();
  return `WA-${date}-${suffix}`;
}

function money(value: number) {
  return `Rs. ${Math.round(value).toLocaleString("en-NP")}`;
}

export function buildWhatsAppMessage(details: WhatsAppOrderDetails) {
  const itemLines = details.items.map((item) => {
    const unit = item.product.unit ? ` (${item.product.unit})` : "";
    return `${item.qty} x ${item.product.name}${unit} - ${money(item.product.price * item.qty)}`;
  });
  const optionalLines = [
    details.mapUrl ? `Map: ${details.mapUrl}` : "",
    details.notes ? `Notes: ${details.notes}` : "",
  ].filter(Boolean);

  return [
    `New order request #${details.reference}`,
    "",
    `Name: ${details.customerName}`,
    `Phone: ${normalizeNepaliPhone(details.phone)}`,
    "",
    "Items:",
    ...itemLines,
    "",
    `Current subtotal: ${money(details.subtotal)}`,
    "Delivery charge: To be confirmed",
    "Final total: To be confirmed",
    "",
    `Address: ${details.address}`,
    ...optionalLines,
    "",
    "Please confirm stock, final price, delivery charge, payment method, and delivery time.",
  ].join("\n");
}

export function buildWhatsAppUrl(message: string) {
  return `https://wa.me/${WHATSAPP_ORDER_NUMBER}?text=${encodeURIComponent(message)}`;
}

export function loadRememberedDetails(): RememberedWhatsAppDetails | null {
  try {
    const raw = localStorage.getItem(REMEMBERED_DETAILS_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<RememberedWhatsAppDetails>;
    if (value.version !== 1) return null;
    if (
      ![value.customerName, value.phone, value.address, value.mapUrl].every(
        (field) => typeof field === "string",
      )
    )
      return null;
    return value as RememberedWhatsAppDetails;
  } catch {
    return null;
  }
}

export function saveRememberedDetails(
  details: Omit<RememberedWhatsAppDetails, "version">,
) {
  try {
    localStorage.setItem(
      REMEMBERED_DETAILS_KEY,
      JSON.stringify({ version: 1, ...details }),
    );
  } catch {
    // Ordering still works when browser storage is disabled or full.
  }
}
