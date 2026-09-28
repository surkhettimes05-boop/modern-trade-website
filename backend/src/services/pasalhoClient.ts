import axios from "axios";

export type PasalhoOrderRequest = {
  branchId: string;
  externalOrderId: string;
  idempotencyKey: string;
  customerName: string;
  phone: string;
  address: string;
  items: Array<{ productId: string; quantity: number }>;
};

export type PasalhoOrderResult = {
  orderId: string;
  orderNumber?: string;
  status: string;
  reservationId?: string;
  currency: string;
  subtotal: number;
  taxAmount: number;
  shippingAmount: number;
  totalAmount: number;
  items?: Array<{
    productId: string;
    unitPrice: number;
    lineTotal: number;
    taxAmount: number;
    lineTotalWithTax: number;
  }>;
};

export class PasalhoError extends Error {
  constructor(
    message: string,
    readonly code:
      | "INSUFFICIENT_STOCK"
      | "CREDIT_VALIDATION"
      | "PAYMENT_FAILED"
      | "DUPLICATE"
      | "UNAVAILABLE"
      | "TIMEOUT"
      | "INVALID_REQUEST",
    readonly statusCode = 502,
  ) {
    super(message);
    this.name = "PasalhoError";
  }
}

function mapError(error: unknown): PasalhoError {
  if (!axios.isAxiosError(error)) {
    return new PasalhoError("Pasalho is unavailable", "UNAVAILABLE");
  }
  if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
    return new PasalhoError("Pasalho request timed out", "TIMEOUT", 504);
  }
  const status = error.response?.status;
  const rawBody = error.response?.data as { code?: string; message?: string; error?: { code?: string; message?: string } };
  const body = rawBody?.error ?? rawBody;
  const code = body?.code?.toUpperCase();
  if (status === 401 || status === 403) {
    return new PasalhoError("Pasalho integration authorization failed", "INVALID_REQUEST", 502);
  }
  if (code === "INSUFFICIENT_STOCK" || ((status === 409 || status === 422) && /stock|reservation/i.test(body?.message || ""))) {
    return new PasalhoError(body.message || "Insufficient stock", "INSUFFICIENT_STOCK", 409);
  }
  if (code === "CREDIT_VALIDATION" || code === "BUSINESS_VALIDATION") {
    return new PasalhoError(body.message || "Business validation failed", "CREDIT_VALIDATION", 422);
  }
  if (code === "PAYMENT_FAILED") {
    return new PasalhoError(body.message || "Payment failed", "PAYMENT_FAILED", 402);
  }
  if (status === 400 || status === 422) {
    return new PasalhoError(body?.message || "Invalid Pasalho order request", "INVALID_REQUEST", 400);
  }
  if (code === "DUPLICATE" || code === "IDEMPOTENCY_CONFLICT") {
    return new PasalhoError("Checkout was already processed", "DUPLICATE", 200);
  }
  if (status === 409) {
    return new PasalhoError(body?.message || "Pasalho rejected the order conflict", "INVALID_REQUEST", 409);
  }
  return new PasalhoError("Pasalho is unavailable", "UNAVAILABLE");
}

export class PasalhoClient {
  private readonly baseUrl = process.env.PASALHO_API_URL?.replace(/\/$/, "");
  private readonly apiKey = process.env.PASALHO_API_KEY;
  private readonly timeoutMs = Number(process.env.PASALHO_TIMEOUT_MS || 10_000);

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  private parseOrderResult(value: unknown): PasalhoOrderResult {
    const body = value as Record<string, unknown>;
    const orderId = String(body.orderId ?? body.id ?? "");
    const status = String(body.status ?? "");
    if (!orderId || !status) {
      throw new PasalhoError("Invalid response from Pasalho", "UNAVAILABLE");
    }
    return {
      orderId,
      orderNumber: body.orderNumber ? String(body.orderNumber) : body.orderNo ? String(body.orderNo) : undefined,
      status,
      reservationId: body.reservationId ? String(body.reservationId) : undefined,
      currency: body.currency ? String(body.currency) : "NPR",
      subtotal: Number(body.subtotal ?? body.grandTotal ?? 0),
      taxAmount: Number(body.taxAmount ?? body.taxTotal ?? 0),
      shippingAmount: Number(body.shippingAmount ?? 0),
      totalAmount: Number(body.totalAmount ?? body.grandTotal ?? 0),
    };
  }

  async createOnlineSalesOrder(request: PasalhoOrderRequest): Promise<PasalhoOrderResult> {
    if (!this.baseUrl || !this.apiKey) {
      throw new PasalhoError("Pasalho integration is not configured", "UNAVAILABLE");
    }
    try {
      const [firstName, ...lastNameParts] = request.customerName.trim().split(/\s+/);
      const response = await axios.post(`${this.baseUrl}/sales-orders/public/checkout`, {
        firstName,
        lastName: lastNameParts.join(" ") || firstName,
        phone: request.phone,
        address: request.address,
        branchId: request.branchId,
        externalOrderId: request.externalOrderId,
        idempotencyKey: request.idempotencyKey,
        items: request.items,
      }, {
        timeout: this.timeoutMs,
        headers: { ...this.headers(), "Idempotency-Key": request.idempotencyKey },
      });
      return this.parseOrderResult(response.data);
    } catch (error) {
      if (error instanceof PasalhoError) throw error;
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        const body = error.response.data as Record<string, unknown>;
        if (body?.id || body?.orderId) return this.parseOrderResult(body);
      }
      throw mapError(error);
    }
  }

  async getSalesOrder(orderId: string): Promise<PasalhoOrderResult> {
    if (!this.isConfigured()) {
      throw new PasalhoError("Pasalho integration is not configured", "UNAVAILABLE");
    }
    try {
      const response = await axios.get(`${this.baseUrl}/sales-orders/public/${encodeURIComponent(orderId)}`, {
        timeout: this.timeoutMs,
        headers: this.headers(),
      });
      return this.parseOrderResult(response.data);
    } catch (error) {
      throw mapError(error);
    }
  }

  async cancelSalesOrder(orderId: string): Promise<PasalhoOrderResult> {
    if (!this.isConfigured()) {
      throw new PasalhoError("Pasalho integration is not configured", "UNAVAILABLE");
    }
    try {
      const response = await axios.post(`${this.baseUrl}/sales-orders/public/${encodeURIComponent(orderId)}/cancel`, {}, {
        timeout: this.timeoutMs,
        headers: this.headers(),
      });
      return this.parseOrderResult(response.data);
    } catch (error) {
      throw mapError(error);
    }
  }
}
