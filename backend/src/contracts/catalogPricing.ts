export type EffectivePriceWindow = {
  validFrom: Date;
  validTo?: Date | null;
};

export function validateEffectivePriceWindow(
  window: EffectivePriceWindow,
): string | null {
  if (!Number.isFinite(window.validFrom.getTime())) {
    return "Price start date must be a valid timestamp";
  }
  if (window.validTo && !Number.isFinite(window.validTo.getTime())) {
    return "Price end date must be a valid timestamp";
  }
  if (window.validTo && window.validTo <= window.validFrom) {
    return "Price end date must be later than its start date";
  }
  return null;
}

export function validatePublishedProductPrice(input: {
  status: string;
  price?: number;
  validFrom: Date;
  validTo?: Date | null;
  now?: Date;
}): string | null {
  if (input.status !== "PUBLISHED") return null;
  const now = input.now || new Date();
  if (
    !input.price ||
    input.validFrom > now ||
    (input.validTo != null && input.validTo <= now)
  ) {
    return "Published products require a currently effective selling price";
  }
  return null;
}
