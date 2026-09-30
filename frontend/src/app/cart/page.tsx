'use client';

import Link from 'next/link';
import { ArrowRight, MapPin, ShoppingCart } from 'lucide-react';
import {
  LocationPicker,
  Quantity,
  useShop,
} from '@/components/CommerceClient';
import { formatPrice } from '@/lib/catalog';

export default function CartPage() {
  const { items, delivery, message } = useShop();
  const subtotal = items.reduce(
    (total, item) => total + item.product.price * item.qty,
    0,
  );

  return (
    <div className="shell page cart-page pasalho-cart-page">
      <div className="cart-page-head">
        <div>
          <p className="eyebrow">YOUR PASALHO BASKET</p>
          <h1>Review your items</h1>
        </div>
        <LocationPicker />
      </div>

      {message ? <p className="commerce-message">{message}</p> : null}

      {items.length ? (
        <div className="cart-layout">
          <div className="pasalho-cart-lines">
            {delivery ? (
              <div className="delivery-note">
                <MapPin />
                <span>
                  <b>{delivery.storeName}</b>
                  <small>
                    Estimated {delivery.etaMinMinutes}–
                    {delivery.etaMaxMinutes} minutes
                  </small>
                </span>
              </div>
            ) : null}

            {items.map((item) => (
              <article className="cart-line" key={item.product.id}>
                <div className="cart-line-copy">
                  <span>{item.product.unit}</span>
                  <h2>{item.product.name}</h2>
                  <p>{item.product.brand}</p>
                  <Quantity id={item.product.id} qty={item.qty} />
                </div>
                <strong>
                  {formatPrice(item.product.price * item.qty)}
                </strong>
              </article>
            ))}
          </div>

          <aside className="order-summary">
            <h2>Bill details</h2>
            <p>
              <span>Item subtotal</span>
              <b>{formatPrice(subtotal)}</b>
            </p>
            <p>
              <span>Delivery fee</span>
              <b>
                {delivery
                  ? delivery.deliveryFee === 0
                    ? 'FREE'
                    : formatPrice(delivery.deliveryFee)
                  : 'At checkout'}
              </b>
            </p>
            <div className="total">
              <span>Current total</span>
              <strong>
                {formatPrice(subtotal + (delivery?.deliveryFee || 0))}
              </strong>
            </div>
            <Link className="primary-btn" href="/checkout">
              Continue to checkout <ArrowRight />
            </Link>
            <small>
              Final stock, store, pricing and delivery fee are checked again by
              Pasalho before the order is placed.
            </small>
          </aside>
        </div>
      ) : (
        <div className="empty-page">
          <ShoppingCart />
          <h2>Your basket is empty</h2>
          <p>Add everyday essentials from your Pasalho store.</p>
          <Link className="primary-btn" href="/shop">
            Start shopping
          </Link>
        </div>
      )}
    </div>
  );
}
