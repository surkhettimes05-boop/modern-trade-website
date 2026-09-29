'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useShop } from '@/components/CommerceClient';
import { MARKET } from '@/lib/market';
import { resilientFetch } from '@/lib/resilientFetch';

function csrfToken() {
  return decodeURIComponent(document.cookie.match(/(?:^|; )customer_csrf=([^;]+)/)?.[1] || '');
}

export default function CheckoutPage() {
  const { items, cartId } = useShop();
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const session = await resilientFetch('/api/auth/session/validate', { credentials: 'include', cache: 'no-store', retries: 0 });
      if (!session.ok) {
        router.push('/account?next=%2Fcheckout');
        return;
      }

      let activeCartId = cartId;
      if (!activeCartId) {
        const cartResponse = await resilientFetch('/api/shopping-cart', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken() },
          body: JSON.stringify({}),
        });
        const cart = await cartResponse.json();
        if (!cartResponse.ok) throw new Error(cart.error || 'Could not create your cart');
        activeCartId = cart.id;
        for (const item of items) {
          const itemResponse = await resilientFetch(`/api/shopping-cart/${activeCartId}/items`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken() },
            body: JSON.stringify({ product_id: item.product.id, quantity: item.qty }),
          });
          const itemResult = await itemResponse.json();
          if (!itemResponse.ok) throw new Error(itemResult.error || `Could not add ${item.product.name} to checkout`);
        }
      }

      const response = await resilientFetch('/api/checkout/cod', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken() },
        body: JSON.stringify({
          cart_id: activeCartId,
          idempotency_key: crypto.randomUUID(),
          delivery_type: 'DELIVERY',
          shipping_name: form.get('name'),
          shipping_phone: form.get('phone'),
          shipping_address: form.get('address'),
          shipping_city: form.get('city'),
          shipping_state: form.get('state'),
          shipping_postal_code: form.get('postal_code'),
          shipping_country: MARKET.countryCode,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Checkout failed');
      router.push(`/account/orders/${result.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Checkout failed');
    } finally {
      setBusy(false);
    }
  }

  if (!items.length) return <div className="shell page"><h1>Your cart is empty</h1></div>;

  return <div className="shell page">
    <h1>Checkout</h1>
    <p className="mt-2 text-slate-600">Cash on delivery · Delivery from Pasalho Central Warehouse</p>
    <form onSubmit={submit} className="mt-8 grid max-w-2xl gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <label>Full name<input required name="name" autoComplete="name" className="mt-1 w-full rounded border p-2" /></label>
      <label>Phone<input required name="phone" autoComplete="tel" placeholder="+977 98XXXXXXXX" className="mt-1 w-full rounded border p-2" /></label>
      <label>Delivery address<input required name="address" autoComplete="street-address" className="mt-1 w-full rounded border p-2" /></label>
      <div className="grid gap-4 md:grid-cols-3">
        <label>City<input required name="city" autoComplete="address-level2" className="mt-1 w-full rounded border p-2" /></label>
        <label>Province<input required name="state" autoComplete="address-level1" className="mt-1 w-full rounded border p-2" /></label>
        <label>Postal code<input required name="postal_code" autoComplete="postal-code" className="mt-1 w-full rounded border p-2" /></label>
      </div>
      {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-700">{error}</p>}
      <button disabled={busy} className="primary-btn">{busy ? 'Placing order…' : 'Place COD order'}</button>
    </form>
  </div>;
}
