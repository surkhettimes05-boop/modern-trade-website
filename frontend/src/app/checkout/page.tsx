'use client';

import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Wallet } from 'lucide-react';
import { formatPrice } from '@/lib/catalog';
import { FormEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useShop } from '@/components/CommerceClient';
import { MARKET } from '@/lib/market';
import { resilientFetch } from '@/lib/resilientFetch';

function csrfToken() {
  return decodeURIComponent(document.cookie.match(/(?:^|; )customer_csrf=([^;]+)/)?.[1] || '');
}

export default function CheckoutPage() {
  const { items, cartId, flushCartWrites, clearCart } = useShop();
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const checkoutIdempotencyKey = useRef<string | null>(null);

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

      let activeCartId = await flushCartWrites() ?? cartId;
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
          idempotency_key: checkoutIdempotencyKey.current ?? (checkoutIdempotencyKey.current = crypto.randomUUID()),
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
      clearCart();
      router.push(`/account/orders/${result.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Checkout failed');
    } finally {
      setBusy(false);
    }
  }

  if (!items.length) return <div className="shell page"><h1>Your cart is empty</h1></div>;

  return <div className="shell page">
    <div className="checkout-intro"><Link href="/cart">← Back to basket</Link><h1>Let’s get your basket home.</h1><p>Add your delivery details and pay when your order arrives.</p></div><div className="checkout-layout">
    <form onSubmit={submit} className="checkout-form">
      <h2><MapPin size={18} className="inline mr-2" /> Delivery address</h2><label>Full name<input required name="name" autoComplete="name" className="mt-1 w-full rounded border p-2" /></label>
      <label>Phone<input required name="phone" autoComplete="tel" placeholder="+977 98XXXXXXXX" className="mt-1 w-full rounded border p-2" /></label>
      <label>Delivery address<input required name="address" autoComplete="street-address" className="mt-1 w-full rounded border p-2" /></label>
      <div className="checkout-address-row">
        <label>City<input required name="city" autoComplete="address-level2" className="mt-1 w-full rounded border p-2" /></label>
        <label>Province<input required name="state" autoComplete="address-level1" className="mt-1 w-full rounded border p-2" /></label>
        <label>Postal code<input required name="postal_code" autoComplete="postal-code" className="mt-1 w-full rounded border p-2" /></label>
      </div>
      <div className="checkout-payment"><Wallet size={22} /><span><strong>Cash on delivery</strong><br /><small>Pay in cash when your order arrives</small></span></div>
      {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-700">{error}</p>}
      <button disabled={busy} className="primary-btn">{busy ? 'Placing order…' : 'Place COD order'}</button>
    </form><aside className="checkout-summary"><h2>Your basket · {items.reduce((n, item) => n + item.qty, 0)} items</h2>{items.map(item => <div key={item.product.id} className="checkout-summary-item"><Image src={item.product.image} width={48} height={48} alt="" /><div><b>{item.product.name}</b><small>{item.product.unit} · Qty {item.qty}</small></div><strong>{formatPrice(item.product.price * item.qty)}</strong></div>)}<div className="checkout-subtotal"><span>Items subtotal</span><strong>{formatPrice(items.reduce((n, item) => n + item.product.price * item.qty, 0))}</strong></div><p>Delivery charges and applicable taxes are calculated when your order is placed. Your order confirmation shows the final total.</p></aside></div>
  </div>;
}
