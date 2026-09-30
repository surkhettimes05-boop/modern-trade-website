'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useShop } from '@/components/CommerceClient';
import { CommerceApiError, commerceFetch, hasCommerceSession } from '@/lib/commerceApi';
import { formatPrice } from '@/lib/market';

type Address = { id: string };
type Cart = { cartToken: string };
type Preview = {
  checkoutToken: string;
  grandTotal: number;
  deliveryFee: number;
  etaMinMinutes: number;
  etaMaxMinutes: number;
};
type CreatedOrder = { id: string; orderNo: string; status: string; grandTotal: number };

export default function CheckoutPage() {
  const {
    items,
    selectedStore,
    serviceZoneId,
    coordinates,
    clearCart,
    resolveCurrentLocation,
  } = useShop();
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasCommerceSession()) {
      router.push('/account?next=/checkout');
      return;
    }
    if (!selectedStore || !serviceZoneId || !coordinates) {
      setError('Set your delivery location before checkout.');
      return;
    }
    if (items.some((item) => !item.product.unitId || !item.product.isLive)) {
      setError('Your cart contains an item that is not available from the live Pasalho catalog. Refresh your location and cart.');
      return;
    }

    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const address = await commerceFetch<Address>('/api/commerce/me/addresses', {
        method: 'POST',
        body: JSON.stringify({
          label: 'HOME',
          recipientName: String(form.get('name') || ''),
          phone: String(form.get('phone') || ''),
          province: String(form.get('province') || ''),
          district: String(form.get('district') || ''),
          municipality: String(form.get('municipality') || ''),
          ward: String(form.get('ward') || ''),
          area: String(form.get('area') || ''),
          street: String(form.get('street') || ''),
          landmark: String(form.get('landmark') || ''),
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          instructions: String(form.get('instructions') || ''),
          isDefault: true,
        }),
      });

      const cart = await commerceFetch<Cart>('/api/commerce/carts', {
        method: 'POST',
        body: JSON.stringify({
          inventoryLocationId: selectedStore.id,
          serviceZoneId,
        }),
      }, { auth: false });

      for (const item of items) {
        await commerceFetch(
          `/api/commerce/carts/${cart.cartToken}/items`,
          {
            method: 'POST',
            body: JSON.stringify({
              productId: item.product.id,
              unitId: item.product.unitId,
              quantity: item.qty,
            }),
          },
          { auth: false },
        );
      }

      const priced = await commerceFetch<Preview>('/api/commerce/checkout/preview', {
        method: 'POST',
        body: JSON.stringify({
          cartToken: cart.cartToken,
          addressId: address.id,
          paymentMethod: 'COD',
        }),
      });
      setPreview(priced);

      const order = await commerceFetch<CreatedOrder>('/api/commerce/orders', {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          cartToken: cart.cartToken,
          addressId: address.id,
          paymentMethod: 'COD',
          checkoutToken: priced.checkoutToken,
        }),
      });

      clearCart();
      router.push(`/account/orders/${order.id}`);
    } catch (exception) {
      if (exception instanceof CommerceApiError && exception.status === 401) {
        router.push('/account?next=/checkout');
        return;
      }
      setError(exception instanceof Error ? exception.message : 'Checkout failed.');
    } finally {
      setBusy(false);
    }
  }

  if (!items.length) {
    return <div className="shell page"><h1>Your cart is empty</h1></div>;
  }

  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.qty, 0);

  return <div className="shell page">
    <h1>Checkout</h1>
    <p className="mt-2 text-slate-600">Cash on delivery · {selectedStore?.name || 'Location required'}</p>
    {!coordinates && <button className="primary-btn mt-4" onClick={() => void resolveCurrentLocation()}>Use my current location</button>}
    <form onSubmit={submit} className="mt-8 grid max-w-2xl gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <label>Full name<input required name="name" className="mt-1 w-full rounded border p-2" /></label>
      <label>Phone<input required name="phone" placeholder="+977 98XXXXXXXX" className="mt-1 w-full rounded border p-2" /></label>
      <div className="grid gap-4 md:grid-cols-2">
        <label>Province<input required name="province" defaultValue="Karnali Province" className="mt-1 w-full rounded border p-2" /></label>
        <label>District<input required name="district" defaultValue="Surkhet" className="mt-1 w-full rounded border p-2" /></label>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label>Municipality<input required name="municipality" defaultValue="Birendranagar" className="mt-1 w-full rounded border p-2" /></label>
        <label>Ward<input required name="ward" className="mt-1 w-full rounded border p-2" /></label>
      </div>
      <label>Area / locality<input required name="area" placeholder="e.g. Itram, Latikoili, Airport Chowk" className="mt-1 w-full rounded border p-2" /></label>
      <label>Street<input name="street" className="mt-1 w-full rounded border p-2" /></label>
      <label>Landmark<input name="landmark" className="mt-1 w-full rounded border p-2" /></label>
      <label>Delivery instructions<textarea name="instructions" rows={3} className="mt-1 w-full rounded border p-2" /></label>

      <div className="rounded-xl bg-slate-50 p-4">
        <p className="flex justify-between"><span>Estimated items subtotal</span><b>{formatPrice(subtotal)}</b></p>
        {preview && <>
          <p className="mt-2 flex justify-between"><span>Delivery</span><b>{formatPrice(preview.deliveryFee)}</b></p>
          <p className="mt-2 flex justify-between"><span>Final total</span><b>{formatPrice(preview.grandTotal)}</b></p>
          <p className="mt-2 text-sm text-slate-600">Estimated delivery {preview.etaMinMinutes}–{preview.etaMaxMinutes} min</p>
        </>}
      </div>

      {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-700">{error}</p>}
      <button disabled={busy || !coordinates} className="primary-btn">{busy ? 'Validating stock and placing order…' : 'Place COD order'}</button>
      <small>Pasalho revalidates price, serviceability and stock immediately before reserving inventory.</small>
    </form>
  </div>;
}
