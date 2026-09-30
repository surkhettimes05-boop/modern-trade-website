'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, MapPin, ShieldCheck } from 'lucide-react';
import { LocationPicker, useShop } from '@/components/CommerceClient';
import { formatPrice } from '@/lib/catalog';
import { commerceRequest } from '@/lib/pasalhoCommerce';

type Customer = {
  id: string;
  phone: string;
  fullName?: string | null;
};

type Address = {
  id: string;
  label: 'HOME' | 'WORK' | 'OTHER';
  recipientName?: string | null;
  phone?: string | null;
  area: string;
  street?: string | null;
  landmark?: string | null;
  ward?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  isDefault: boolean;
};

type Preview = {
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

type OrderResult = {
  id: string;
  orderNo: string;
  status: string;
};

export default function CheckoutPage() {
  const { items, cartToken, delivery, clearCart } = useShop();
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [checkingAccount, setCheckingAccount] = useState(true);
  const [phone, setPhone] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [otp, setOtp] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const idempotencyKey = useRef('');

  const loadAccount = async () => {
    try {
      const me = await commerceRequest<Customer>('me');
      setCustomer(me);
      const saved = await commerceRequest<Address[]>('me/addresses');
      setAddresses(saved);
      const preferred = saved.find((address) => address.isDefault) || saved[0];
      setSelectedAddressId(preferred?.id || '');
    } catch {
      setCustomer(null);
      setAddresses([]);
      setSelectedAddressId('');
    } finally {
      setCheckingAccount(false);
    }
  };

  useEffect(() => {
    void loadAccount();
  }, []);

  async function requestOtp(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/customer-session/request-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const value = (await response.json()) as {
        data?: { challengeId?: string };
        error?: string | { message?: string };
      };
      if (!response.ok) {
        throw new Error(
          typeof value.error === 'string'
            ? value.error
            : value.error?.message || 'Could not send OTP',
        );
      }
      if (!value.data?.challengeId) throw new Error('OTP challenge was not returned');
      setChallengeId(value.data.challengeId);
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Could not send OTP');
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/customer-session/verify-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ challengeId, phone, otp }),
      });
      const value = (await response.json()) as {
        error?: string | { message?: string };
      };
      if (!response.ok) {
        throw new Error(
          typeof value.error === 'string'
            ? value.error
            : value.error?.message || 'OTP verification failed',
        );
      }
      await loadAccount();
    } catch (value) {
      setError(value instanceof Error ? value.message : 'OTP verification failed');
    } finally {
      setBusy(false);
    }
  }

  async function saveAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!delivery) {
      setError('Set your delivery location before saving an address.');
      return;
    }

    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const address = await commerceRequest<Address>('me/addresses', {
        method: 'POST',
        body: JSON.stringify({
          label: 'HOME',
          recipientName: form.get('recipientName'),
          phone: customer?.phone,
          province: 'Karnali Province',
          district: 'Surkhet',
          municipality: 'Birendranagar',
          ward: form.get('ward') || undefined,
          area: form.get('area'),
          street: form.get('street') || undefined,
          landmark: form.get('landmark') || undefined,
          instructions: form.get('instructions') || undefined,
          latitude: delivery.latitude,
          longitude: delivery.longitude,
          isDefault: addresses.length === 0,
        }),
      });
      setAddresses((current) => [...current, address]);
      setSelectedAddressId(address.id);
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Could not save address');
    } finally {
      setBusy(false);
    }
  }

  async function reviewOrder() {
    if (!cartToken || !selectedAddressId) return;
    setBusy(true);
    setError('');
    setPreview(null);
    try {
      const value = await commerceRequest<Preview>('checkout/preview', {
        method: 'POST',
        body: JSON.stringify({
          cartToken,
          addressId: selectedAddressId,
          paymentMethod: 'COD',
        }),
      });
      setPreview(value);
      idempotencyKey.current = '';
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Could not review checkout');
    } finally {
      setBusy(false);
    }
  }

  async function placeOrder() {
    if (!preview || !cartToken || !selectedAddressId) return;
    if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();

    setBusy(true);
    setError('');
    try {
      const order = await commerceRequest<OrderResult>('orders', {
        method: 'POST',
        headers: { 'idempotency-key': idempotencyKey.current },
        body: JSON.stringify({
          cartToken,
          addressId: selectedAddressId,
          paymentMethod: 'COD',
          checkoutToken: preview.checkoutToken,
        }),
      });
      clearCart();
      router.push(`/account/orders/${order.id}`);
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Could not place order');
    } finally {
      setBusy(false);
    }
  }

  if (!items.length) {
    return (
      <div className="shell page checkout-shell">
        <h1>Your basket is empty</h1>
        <Link className="primary-btn" href="/shop">Browse products</Link>
      </div>
    );
  }

  if (!delivery) {
    return (
      <div className="shell page checkout-shell">
        <p className="eyebrow">CHECKOUT</p>
        <h1>Set your delivery location first</h1>
        <p>Pasalho needs it to confirm the service zone and fulfillment store.</p>
        <LocationPicker prominent />
      </div>
    );
  }

  return (
    <div className="shell page checkout-shell">
      <div className="checkout-heading">
        <div>
          <p className="eyebrow">PASALHO CHECKOUT</p>
          <h1>Delivery details</h1>
          <p><MapPin /> {delivery.storeName} · {delivery.etaMinMinutes}–{delivery.etaMaxMinutes} min estimate</p>
        </div>
        <span><ShieldCheck /> COD only</span>
      </div>

      {error ? <p className="form-error checkout-error" role="alert">{error}</p> : null}

      {checkingAccount ? (
        <div className="checkout-panel">Checking your account…</div>
      ) : !customer ? (
        <section className="checkout-panel checkout-login">
          <h2>Sign in to continue</h2>
          <p>Your phone connects this order to addresses and tracking.</p>
          {!challengeId ? (
            <form onSubmit={requestOtp}>
              <label>
                Nepal mobile number
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="98XXXXXXXX"
                  required
                />
              </label>
              <button className="primary-btn" disabled={busy}>
                {busy ? 'Sending…' : 'Send OTP'}
              </button>
            </form>
          ) : (
            <form onSubmit={verifyOtp}>
              <label>
                6-digit OTP
                <input
                  value={otp}
                  onChange={(event) =>
                    setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                />
              </label>
              <button className="primary-btn" disabled={busy || otp.length !== 6}>
                {busy ? 'Verifying…' : 'Verify'}
              </button>
            </form>
          )}
        </section>
      ) : (
        <div className="checkout-grid">
          <div className="checkout-main">
            <section className="checkout-panel">
              <div className="checkout-panel-title">
                <span>1</span>
                <div><h2>Delivery address</h2><p>{customer.phone}</p></div>
              </div>

              {addresses.length ? (
                <div className="address-list">
                  {addresses.map((address) => (
                    <label
                      className={`address-choice ${selectedAddressId === address.id ? 'selected' : ''}`}
                      key={address.id}
                    >
                      <input
                        type="radio"
                        name="address"
                        checked={selectedAddressId === address.id}
                        onChange={() => {
                          setSelectedAddressId(address.id);
                          setPreview(null);
                        }}
                      />
                      <span>
                        <b>{address.label}</b>
                        <strong>{address.area}</strong>
                        <small>
                          {[address.street, address.landmark, address.ward && `Ward ${address.ward}`]
                            .filter(Boolean)
                            .join(', ')}
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <form onSubmit={saveAddress} className="address-form">
                  <label>
                    Recipient name
                    <input name="recipientName" defaultValue={customer.fullName || ''} required />
                  </label>
                  <label>
                    Area / tole
                    <input name="area" placeholder="e.g. Itram, Latikoili" required />
                  </label>
                  <div className="address-form-row">
                    <label>Ward<input name="ward" inputMode="numeric" /></label>
                    <label>Street<input name="street" /></label>
                  </div>
                  <label>Landmark<input name="landmark" placeholder="Near..." /></label>
                  <label>
                    Delivery instructions
                    <textarea name="instructions" rows={2} />
                  </label>
                  <button className="primary-btn" disabled={busy}>
                    {busy ? 'Saving…' : 'Save delivery address'}
                  </button>
                </form>
              )}
            </section>

            <section className="checkout-panel">
              <div className="checkout-panel-title">
                <span>2</span>
                <div><h2>Payment</h2><p>Cash on delivery</p></div>
              </div>
              <div className="cod-choice">
                <CheckCircle2 />
                <span><b>COD</b><small>Pay when the order reaches you.</small></span>
              </div>
            </section>
          </div>

          <aside className="checkout-summary">
            <h2>{items.length} basket item{items.length === 1 ? '' : 's'}</h2>
            <div className="checkout-mini-items">
              {items.slice(0, 5).map((item) => (
                <p key={item.product.id}>
                  <span>{item.qty} × {item.product.name}</span>
                  <b>{formatPrice(item.qty * item.product.price)}</b>
                </p>
              ))}
            </div>

            {preview ? (
              <>
                <div className="checkout-bill">
                  <p><span>Items</span><b>{formatPrice(preview.subtotal)}</b></p>
                  <p><span>Delivery</span><b>{preview.deliveryFee ? formatPrice(preview.deliveryFee) : 'FREE'}</b></p>
                  <p><span>Handling</span><b>{preview.handlingFee ? formatPrice(preview.handlingFee) : '—'}</b></p>
                  <p className="checkout-total"><span>Total</span><b>{formatPrice(preview.grandTotal)}</b></p>
                </div>
                <button className="primary-btn" onClick={placeOrder} disabled={busy}>
                  {busy ? 'Placing order…' : 'Place COD order'}
                </button>
                <small>
                  Pasalho rechecks price and stock, then reserves inventory
                  atomically when the order is accepted.
                </small>
              </>
            ) : (
              <button
                className="primary-btn"
                onClick={reviewOrder}
                disabled={busy || !selectedAddressId || !cartToken}
              >
                {busy ? 'Checking…' : 'Review final total'}
              </button>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
