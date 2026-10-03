'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useShop } from '@/components/CommerceClient';
import { MARKET, formatPrice } from '@/lib/market';
import { resilientFetch } from '@/lib/resilientFetch';

type Division = { id: number; name_en?: string; name?: string; ward_number?: number; wards?: Division[] };
type DeliveryQuote = {
  key?: string;
  serviceable: boolean;
  reason?: string;
  zone_name?: string;
  delivery_fee?: number;
  free_delivery_threshold?: number;
  estimated_delivery_hours?: number;
};

function customerCsrf() {
  return document.cookie.match(/(?:^|; )customer_csrf=([^;]+)/)?.[1] || '';
}

export default function CheckoutPage() {
  const { items, selectedStore, clear } = useShop();
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [deliveryType, setDeliveryType] = useState<'DELIVERY' | 'PICKUP'>('DELIVERY');
  const [municipalities, setMunicipalities] = useState<Division[]>([]);
  const [municipalityId, setMunicipalityId] = useState('');
  const [wardId, setWardId] = useState('');
  const [quote, setQuote] = useState<DeliveryQuote | null>(null);
  const subtotal = useMemo(
    () => items.reduce((total, item) => total + item.product.price * item.qty, 0),
    [items],
  );
  const wards = useMemo(
    () =>
      municipalities.find(
        (candidate) => String(candidate.id) === municipalityId,
      )?.wards || [],
    [municipalities, municipalityId],
  );
  const quoteKey =
    deliveryType === 'DELIVERY' &&
    authenticated &&
    selectedStore &&
    municipalityId &&
    wardId
      ? [selectedStore.id, municipalityId, wardId, subtotal].join(':')
      : '';
  const activeQuote = quote?.key === quoteKey ? quote : null;

  useEffect(() => {
    const controller = new AbortController();
    resilientFetch('/api/auth/session/validate', {
      signal: controller.signal,
      credentials: 'include',
      cache: 'no-store',
    })
      .then((sessionResponse) => setAuthenticated(sessionResponse.ok))
      .catch(() => {
        if (!controller.signal.aborted) setAuthenticated(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!authenticated || !selectedStore) return;
    const controller = new AbortController();
    resilientFetch(
      `/api/checkout/service-areas?store_id=${encodeURIComponent(selectedStore.id)}`,
      { signal: controller.signal, credentials: 'include', cache: 'no-store' },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load delivery areas');
        const body: unknown = await response.json();
        setMunicipalities(Array.isArray(body) ? (body as Division[]) : []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setMunicipalities([]);
      });
    return () => controller.abort();
  }, [authenticated, selectedStore]);

  useEffect(() => {
    if (!quoteKey || !selectedStore) return;
    const controller = new AbortController();
    resilientFetch('/api/checkout/delivery-quote', {
      method: 'POST',
      credentials: 'include',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': customerCsrf(),
      },
      body: JSON.stringify({
        store_id: selectedStore.id,
        municipality_id: Number(municipalityId),
        ward_id: Number(wardId),
        order_value: subtotal,
      }),
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as DeliveryQuote;
        setQuote({
          ...body,
          key: quoteKey,
          serviceable: response.ok && body.serviceable !== false,
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setQuote({
            key: quoteKey,
            serviceable: false,
            reason: 'Could not verify delivery area',
          });
        }
      });
    return () => controller.abort();
  }, [municipalityId, quoteKey, selectedStore, subtotal, wardId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedStore) {
      setError('Choose an open Pasalho store before checkout.');
      return;
    }
    if (selectedStore.is_temporarily_closed) {
      setError('This store is temporarily closed and cannot accept orders.');
      return;
    }
    if (!authenticated) {
      setError('Sign in with your phone number before placing an order.');
      return;
    }
    if (deliveryType === 'DELIVERY' && !activeQuote?.serviceable) {
      setError(activeQuote?.reason || 'Choose a serviceable delivery area.');
      return;
    }

    const form = new FormData(event.currentTarget);
    const csrf = customerCsrf();
    const fingerprint = JSON.stringify({
      store: selectedStore.id,
      items: items.map((item) => [item.product.id, item.qty]).sort(),
    });
    const idempotencyStorageKey = `pasalho-checkout-idempotency:${fingerprint}`;
    let idempotencyKey = sessionStorage.getItem(idempotencyStorageKey);
    if (!idempotencyKey) {
      idempotencyKey = crypto.randomUUID();
      sessionStorage.setItem(idempotencyStorageKey, idempotencyKey);
    }

    setBusy(true);
    setError('');
    try {
      const cartResponse = await resilientFetch('/api/shopping-cart', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ store_id: selectedStore.id }),
      });
      const cart = await cartResponse.json();
      if (!cartResponse.ok) throw new Error(cart.error || 'Could not create cart');

      // Rebuild the server cart from the browser snapshot on every retry. This
      // makes a partially failed previous sync safe instead of doubling items.
      const clearResponse = await resilientFetch(`/api/shopping-cart/${cart.id}/clear`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
      });
      if (!clearResponse.ok) {
        const clearBody = await clearResponse.json().catch(() => ({}));
        throw new Error(clearBody.error || 'Could not synchronize cart');
      }

      for (const item of items) {
        const itemResponse = await resilientFetch(`/api/shopping-cart/${cart.id}/items`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
          body: JSON.stringify({ product_id: item.product.id, quantity: item.qty }),
        });
        const itemResult = await itemResponse.json();
        if (!itemResponse.ok) {
          throw new Error(itemResult.error || 'Could not synchronize every cart item');
        }
      }

      const payload =
        deliveryType === 'DELIVERY'
          ? {
              cart_id: cart.id,
              store_id: selectedStore.id,
              idempotency_key: idempotencyKey,
              delivery_type: 'DELIVERY',
              shipping_name: form.get('name'),
              shipping_phone: form.get('phone'),
              shipping_address: form.get('address'),
              shipping_municipality_id: Number(municipalityId),
              shipping_ward_id: Number(wardId),
              shipping_postal_code: form.get('postal_code'),
              shipping_country: MARKET.countryCode,
            }
          : {
              cart_id: cart.id,
              store_id: selectedStore.id,
              idempotency_key: idempotencyKey,
              delivery_type: 'PICKUP',
              shipping_name: form.get('name'),
              shipping_phone: form.get('phone'),
            };

      const response = await resilientFetch('/api/checkout/cod', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Checkout failed');

      sessionStorage.removeItem(idempotencyStorageKey);
      clear();
      router.push(`/account/orders/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setBusy(false);
    }
  }

  if (!items.length) {
    return (
      <div className="shell page">
        <h1>Your cart is empty</h1>
        <Link href="/shop" className="primary-btn mt-6">Continue shopping</Link>
      </div>
    );
  }

  if (authenticated === false) {
    return (
      <div className="shell page max-w-xl">
        <h1>Sign in to checkout</h1>
        <p className="mt-3 text-slate-600">
          Enter your Nepal mobile number. If you are new to Pasalho, your account
          will be created automatically after OTP verification.
        </p>
        <Link className="primary-btn mt-6" href="/account?next=/checkout">
          Sign in / create account
        </Link>
      </div>
    );
  }

  return (
    <div className="shell page">
      <h1>Checkout</h1>
      <p className="mt-2 text-slate-600">
        Cash on delivery · {selectedStore?.name || 'Choose a store'} · Prices include applicable taxes.
      </p>

      <form onSubmit={submit} className="mt-8 grid max-w-2xl gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <label>
          Full name
          <input required name="name" className="mt-1 w-full rounded border p-2" />
        </label>
        <label>
          Phone
          <input required name="phone" placeholder="98XXXXXXXX" className="mt-1 w-full rounded border p-2" />
        </label>

        <label>
          Fulfilment
          <select
            name="delivery_type"
            value={deliveryType}
            onChange={(event) => {
              setDeliveryType(event.target.value as 'DELIVERY' | 'PICKUP');
              setQuote(null);
            }}
            className="mt-1 w-full rounded border p-2"
          >
            <option value="DELIVERY">Delivery</option>
            <option value="PICKUP">Store pickup</option>
          </select>
        </label>

        {deliveryType === 'DELIVERY' ? (
          <>
            <label>
              Complete address / tole / landmark
              <textarea required name="address" rows={3} className="mt-1 w-full rounded border p-2" />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label>
                Municipality
                <select
                  required
                  value={municipalityId}
                  onChange={(event) => {
                    setMunicipalityId(event.target.value);
                    setWardId('');
                    setQuote(null);
                  }}
                  className="mt-1 w-full rounded border p-2"
                >
                  <option value="">Choose service area</option>
                  {municipalities.map((municipality) => (
                    <option key={municipality.id} value={municipality.id}>
                      {municipality.name_en || municipality.name || `Municipality ${municipality.id}`}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Ward
                <select
                  required
                  value={wardId}
                  onChange={(event) => {
                    setWardId(event.target.value);
                    setQuote(null);
                  }}
                  disabled={!municipalityId}
                  className="mt-1 w-full rounded border p-2 disabled:bg-slate-100"
                >
                  <option value="">Choose ward</option>
                  {wards.map((ward) => (
                    <option key={ward.id} value={ward.id}>
                      Ward {ward.ward_number ?? ward.id}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Postal code
              <input required name="postal_code" inputMode="numeric" pattern="[0-9]{5}" className="mt-1 w-full rounded border p-2" />
            </label>

            {municipalityId && wardId ? (
              <div className={`rounded-xl border p-4 text-sm ${activeQuote?.serviceable ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
                {activeQuote === null
                  ? 'Checking delivery availability…'
                  : activeQuote.serviceable
                    ? `${activeQuote.zone_name || 'Delivery area'} · Delivery ${formatPrice(Number(activeQuote.delivery_fee || 0))}${activeQuote.estimated_delivery_hours ? ` · about ${activeQuote.estimated_delivery_hours}h` : ''}`
                    : activeQuote.reason || 'This address is outside the current delivery area.'}
              </div>
            ) : null}
          </>
        ) : (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
            Your order will be prepared at {selectedStore?.name || 'the selected store'} for pickup.
          </p>
        )}

        <div className="rounded-xl bg-slate-50 p-4 text-sm">
          <p className="flex justify-between"><span>Products</span><strong>{formatPrice(subtotal)}</strong></p>
          <p className="mt-2 flex justify-between"><span>Delivery</span><strong>{deliveryType === 'PICKUP' ? formatPrice(0) : activeQuote?.serviceable ? formatPrice(Number(activeQuote.delivery_fee || 0)) : 'Calculated by area'}</strong></p>
          <p className="mt-3 flex justify-between border-t border-slate-200 pt-3 text-base"><span>Total</span><strong>{formatPrice(subtotal + (deliveryType === 'DELIVERY' && activeQuote?.serviceable ? Number(activeQuote.delivery_fee || 0) : 0))}</strong></p>
        </div>

        {error ? <p role="alert" className="rounded bg-red-50 p-3 text-red-700">{error}</p> : null}
        <button
          disabled={
            busy ||
            authenticated !== true ||
            !selectedStore ||
            selectedStore.is_temporarily_closed ||
            (deliveryType === 'DELIVERY' && !activeQuote?.serviceable)
          }
          className="primary-btn"
        >
          {busy ? 'Placing order…' : 'Place COD order'}
        </button>
      </form>
    </div>
  );
}
