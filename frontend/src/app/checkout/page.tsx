'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MapPin, ShieldCheck, Truck } from 'lucide-react';
import { useShop } from '@/components/CommerceClient';
import { formatPrice } from '@/lib/catalog';
import {
  createCustomerAddress,
  getCustomer,
  listCustomerAddresses,
  placeOrder,
  previewCheckout,
  type CheckoutPreview,
  type Customer,
  type CustomerAddress,
} from '@/lib/pasalhoCommerce';

export default function CheckoutPage() {
  const { items, delivery, cartToken, clearCart, requestLocation } = useShop();
  const router = useRouter();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [addressId, setAddressId] = useState('');
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [preview, setPreview] = useState<CheckoutPreview | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const subtotal = useMemo(
    () => items.reduce((total, item) => total + item.product.price * item.qty, 0),
    [items],
  );

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      Promise.all([getCustomer(), listCustomerAddresses()])
        .then(([me, saved]) => {
          if (!active) return;
          setCustomer(me);
          setAddresses(saved);
          const preferred = saved.find((address) => address.isDefault) || saved[0];
          if (preferred) {
            setAddressId(preferred.id);
            setShowAddressForm(false);
          } else {
            setShowAddressForm(true);
          }
        })
        .catch(() => undefined)
        .finally(() => {
          if (active) setChecking(false);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (!cartToken || !addressId || !customer) {
        if (active) setPreview(null);
        return;
      }
      if (active) setError('');
      previewCheckout(cartToken, addressId)
        .then((value) => {
          if (active) setPreview(value);
        })
        .catch((reason) => {
          if (active) {
            setPreview(null);
            setError(
              reason instanceof Error
                ? reason.message
                : 'Could not validate checkout.',
            );
          }
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [addressId, cartToken, customer]);

  async function saveAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!delivery) {
      requestLocation();
      return;
    }

    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const created = await createCustomerAddress({
        label: 'HOME',
        recipientName: String(form.get('recipientName') || ''),
        phone: customer?.phone || undefined,
        province: String(form.get('province') || '') || undefined,
        district: String(form.get('district') || '') || undefined,
        municipality: String(form.get('municipality') || '') || undefined,
        ward: String(form.get('ward') || '') || undefined,
        area: String(form.get('area') || ''),
        street: String(form.get('street') || '') || undefined,
        landmark: String(form.get('landmark') || '') || undefined,
        latitude: delivery.latitude,
        longitude: delivery.longitude,
        instructions: String(form.get('instructions') || '') || undefined,
        isDefault: addresses.length === 0,
      });
      setAddresses((current) => [...current, created]);
      setAddressId(created.id);
      setShowAddressForm(false);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Could not save address.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitOrder() {
    if (!preview || !cartToken || !addressId) return;
    setBusy(true);
    setError('');
    const idempotencyStorageKey =
      `pasalho-order-idempotency:${cartToken}:${addressId}`;
    let idempotencyKey = sessionStorage.getItem(idempotencyStorageKey);
    if (!idempotencyKey) {
      idempotencyKey = crypto.randomUUID();
      sessionStorage.setItem(idempotencyStorageKey, idempotencyKey);
    }

    try {
      const result = await placeOrder(
        cartToken,
        addressId,
        preview.checkoutToken,
        idempotencyKey,
      );
      sessionStorage.removeItem(idempotencyStorageKey);
      clearCart();
      router.push(`/account/orders/${result.id}`);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Could not place order.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (!items.length) {
    return (
      <div className="shell page">
        <h1>Your cart is empty</h1>
        <Link className="primary-btn" href="/shop">Start shopping</Link>
      </div>
    );
  }

  if (checking) {
    return <div className="shell page"><p>Preparing secure checkout…</p></div>;
  }

  if (!customer) {
    return (
      <div className="shell page checkout-login">
        <ShieldCheck />
        <h1>Sign in to checkout</h1>
        <p>
          Your phone number keeps the order, delivery address and tracking
          attached to the right customer.
        </p>
        <Link className="primary-btn" href="/account?next=/checkout">
          Sign in with OTP
        </Link>
      </div>
    );
  }

  if (!delivery) {
    return (
      <div className="shell page checkout-login">
        <MapPin />
        <h1>Set your delivery location</h1>
        <p>
          Pasalho needs your location to choose a fulfillment store and
          validate live inventory.
        </p>
        <button className="primary-btn" onClick={requestLocation}>
          Set location
        </button>
      </div>
    );
  }

  return (
    <div className="shell page pasalho-checkout">
      <div className="page-head">
        <div>
          <p className="eyebrow">SECURE PASALHO CHECKOUT</p>
          <h1>Delivery & payment</h1>
          <p>Cash on delivery · {delivery.storeName}</p>
        </div>
      </div>

      <div className="checkout-grid">
        <div className="checkout-main">
          <section className="checkout-card">
            <h2>Delivery address</h2>
            {addresses.length && !showAddressForm ? (
              <>
                <div className="address-options">
                  {addresses.map((address) => (
                    <label
                      key={address.id}
                      className={addressId === address.id ? 'selected' : ''}
                    >
                      <input
                        type="radio"
                        name="address"
                        checked={addressId === address.id}
                        onChange={() => setAddressId(address.id)}
                      />
                      <span>
                        <b>
                          {address.customLabel ||
                            address.recipientName ||
                            address.label}
                        </b>
                        <small>
                          {[
                            address.area,
                            address.street,
                            address.landmark,
                            address.municipality,
                          ]
                            .filter(Boolean)
                            .join(', ')}
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => setShowAddressForm(true)}
                >
                  + Add another address
                </button>
              </>
            ) : (
              <form className="address-form" onSubmit={saveAddress}>
                <label>
                  Recipient name
                  <input name="recipientName" required />
                </label>
                <label>
                  Area / tole
                  <input name="area" required />
                </label>
                <label>
                  Street
                  <input name="street" />
                </label>
                <label>
                  Landmark
                  <input name="landmark" />
                </label>
                <div className="address-row">
                  <label>
                    Municipality
                    <input name="municipality" defaultValue="Birendranagar" />
                  </label>
                  <label>
                    Ward
                    <input name="ward" />
                  </label>
                </div>
                <div className="address-row">
                  <label>
                    District
                    <input name="district" defaultValue="Surkhet" />
                  </label>
                  <label>
                    Province
                    <input name="province" defaultValue="Karnali Province" />
                  </label>
                </div>
                <label>
                  Delivery instructions
                  <textarea name="instructions" rows={3} />
                </label>
                <div className="address-form-actions">
                  {addresses.length ? (
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => setShowAddressForm(false)}
                      disabled={busy}
                    >
                      Cancel
                    </button>
                  ) : null}
                  <button className="primary-btn" disabled={busy}>
                    {busy ? 'Saving…' : 'Save address'}
                  </button>
                </div>
              </form>
            )}
          </section>

          <section className="checkout-card">
            <h2>Payment</h2>
            <div className="cod-option">
              <ShieldCheck />
              <span>
                <b>Cash on delivery</b>
                <small>Digital payments stay disabled until certified.</small>
              </span>
            </div>
          </section>
        </div>

        <aside className="checkout-summary">
          <h2>Order summary</h2>
          <p>
            <span>Items</span>
            <b>{formatPrice(preview?.subtotal ?? subtotal)}</b>
          </p>
          <p>
            <span>Delivery</span>
            <b>{preview ? formatPrice(preview.deliveryFee) : 'Checking…'}</b>
          </p>
          <p>
            <span>Handling</span>
            <b>{preview ? formatPrice(preview.handlingFee) : '—'}</b>
          </p>
          <div className="checkout-total">
            <span>Total</span>
            <strong>{formatPrice(preview?.grandTotal ?? subtotal)}</strong>
          </div>
          {preview ? (
            <div className="checkout-eta">
              <Truck />
              <span>
                <b>{preview.etaMinMinutes}–{preview.etaMaxMinutes} min estimate</b>
                <small>Confirmed from current fulfillment availability</small>
              </span>
            </div>
          ) : null}
          {error ? (
            <p className="commerce-message error" role="alert">{error}</p>
          ) : null}
          <button
            className="primary-btn"
            disabled={busy || !preview || !addressId}
            onClick={submitOrder}
          >
            {busy ? 'Placing order…' : 'Place COD order'}
          </button>
          <small>
            Pasalho revalidates price, stock and store assignment when you
            place the order.
          </small>
        </aside>
      </div>
    </div>
  );
}
