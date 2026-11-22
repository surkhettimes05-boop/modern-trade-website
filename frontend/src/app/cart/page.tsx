'use client';

import Link from 'next/link';
import { ArrowRight, Lock, MessageCircle, ShoppingCart } from 'lucide-react';
import { Quantity, useShop } from '@/components/CommerceClient';
import { formatPrice } from '@/lib/catalog';

export default function CartPage() {
  const { items, authenticated, pricingQuote, pricingBusy, pricingError, browseOnly, webCheckoutEnabled } = useShop();
  const subtotal = pricingQuote
    ? Number(pricingQuote.finalTotal)
    : authenticated === false
      ? items.reduce((total, item) => total + item.product.price * item.qty, 0)
      : null;
  const quotedLines = new Map(pricingQuote?.items.map((line) => [line.sku, line]) || []);

  return (
    <div className="shell page cart-page">
      <nav className="breadcrumbs"><Link href="/">Home</Link><span>›</span>Cart</nav>
      <h1>Your cart</h1>
      {items.length ? (
        <div className="cart-layout">
          <div>
            <div className="delivery-note">{browseOnly && !webCheckoutEnabled ? 'This is a request only. The store will confirm stock, final price, delivery availability, and any delivery fee.' : 'Delivery availability and fee are calculated from your Pasalho store and service area at checkout.'}</div>
            {items.map((item) => {
              const line = item.product.sku ? quotedLines.get(item.product.sku) : undefined;
              return (
                <article className="cart-line" key={item.product.id}>
                  <div>
                    <span>{item.product.brand}</span>
                    <h2>{item.product.name}</h2>
                    <p>● {item.product.availability}</p>
                    {line && <p className="text-sm text-slate-600">Regular {formatPrice(Number(line.regularUnitPrice))} · Applied {formatPrice(Number(line.appliedUnitPrice))} · Saving {formatPrice(Number(line.lineDiscount))}</p>}
                    <Quantity id={item.product.id} qty={item.qty} />
                  </div>
                  <strong>
                    {line
                      ? formatPrice(Number(line.lineTotal))
                      : authenticated === false
                        ? formatPrice(item.product.price * item.qty)
                        : pricingBusy
                          ? 'Updating price…'
                          : 'Price unavailable'}
                  </strong>
                </article>
              );
            })}
          </div>
          <aside className="order-summary">
            <h2>Order summary</h2>
            {pricingQuote ? (
              <>
                <p><span>Regular subtotal</span><b>{formatPrice(Number(pricingQuote.subtotal))}</b></p>
                <p><span>{pricingQuote.campaignPromotion ? `Savings · ${pricingQuote.campaignPromotion.name}` : 'Member savings'}</span><b>-{formatPrice(Number(pricingQuote.discountTotal))}</b></p>
              </>
            ) : (
              <p>
                <span>{browseOnly && !webCheckoutEnabled ? 'Estimated subtotal' : 'Subtotal'}</span>
                <b>{subtotal === null ? pricingBusy ? 'Updating price…' : 'Price unavailable' : formatPrice(subtotal)}</b>
              </p>
            )}
            {pricingBusy && <p role="status">Requesting current price…</p>}
            {pricingError && <p role="alert" className="text-red-700">{pricingError}</p>}
            {(!browseOnly || webCheckoutEnabled) && <p><span>Delivery</span><b>Confirmed at checkout</b></p>}
            <div className="total">
              <span>{browseOnly && !webCheckoutEnabled ? 'Estimated subtotal' : 'Payable'}</span>
              <strong>{subtotal === null ? 'Price unavailable' : formatPrice(subtotal)}</strong>
            </div>
            {browseOnly && !webCheckoutEnabled ? <p className="mt-4 rounded-lg bg-slate-100 px-5 py-3 text-center text-sm font-semibold text-slate-700">Online COD checkout is not open yet.</p> : <Link className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[#168b52] px-5 py-3 font-bold text-white" href="/checkout">
              <Lock size={18} /> Continue to COD checkout <ArrowRight />
            </Link>}
            <Link className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-800 px-5 py-3 font-bold text-emerald-800" href="/whatsapp-order">
              <MessageCircle /> Order through WhatsApp
            </Link>
            <small>{browseOnly && !webCheckoutEnabled ? 'This is only a request. The store confirms stock, final price, delivery fee, and acceptance by phone or WhatsApp.' : 'Checkout requires a fresh server-issued price quote. Stock and delivery are checked before the order is placed. WhatsApp requests remain manual.'}</small>
          </aside>
        </div>
      ) : (
        <div className="empty-page">
          <ShoppingCart /><h2>Your cart is empty</h2>
          <p>Fill it with everyday favourites and fresh finds.</p>
          <Link className="primary-btn" href="/shop">Start shopping</Link>
        </div>
      )}
    </div>
  );
}
