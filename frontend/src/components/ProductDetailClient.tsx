'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, Truck } from 'lucide-react';
import { formatPrice, Product } from '@/lib/catalog';
import { useShop } from './CommerceClient';

export function ProductGallery({ product }: { product: Product }) {
  const [zoom, setZoom] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!zoom) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setZoom(false);
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        closeRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    const trigger = triggerRef.current;
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      trigger?.focus();
    };
  }, [zoom]);

  return (
    <div className="gallery">
      <button
        ref={triggerRef}
        className="gallery-main"
        onClick={() => setZoom(true)}
        aria-label="Zoom product image"
      >
        <Image
          src={product.image}
          fill
          priority
          sizes="(max-width:800px) 100vw, 50vw"
          alt={product.name}
        />
        <span>Tap to enlarge</span>
      </button>
      {zoom ? (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Product image preview"
          onClick={() => setZoom(false)}
        >
          <Image src={product.image} width={900} height={900} alt={product.name} />
          <button ref={closeRef} aria-label="Close" onClick={() => setZoom(false)}>
            Close
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function BuyBox({ product }: { product: Product }) {
  const { add, delivery, cartBusy } = useShop();
  const [quantity, setQuantity] = useState(1);
  const save = product.originalPrice
    ? Math.round((1 - product.price / product.originalPrice) * 100)
    : 0;
  const unavailable = product.availability.toLowerCase().includes('out');
  const maxQuantity = Math.max(
    1,
    Math.floor(product.maxOrderQuantity || Number.MAX_SAFE_INTEGER),
  );

  return (
    <div className="buy-box">
      <span className="brand">{product.unit || product.brand}</span>
      <h1>{product.name}</h1>
      <div className="pdp-price">
        <strong>{formatPrice(product.price)}</strong>
        {product.originalPrice ? (
          <>
            <del>{formatPrice(product.originalPrice)}</del>
            {save > 0 ? <span>{save}% off</span> : null}
          </>
        ) : null}
      </div>
      <small>Current store price · {product.unit || 'standard pack'}</small>

      <div className="availability">
        <b>● {product.availability}</b>
        <span>{delivery ? `Live at ${delivery.storeName}` : 'Set location for live stock'}</span>
      </div>

      <div className="fulfilment">
        <div>
          <Truck />
          <span>
            <b>Delivery</b>
            <small>
              {delivery
                ? `Estimated ${delivery.etaMinMinutes}–${delivery.etaMaxMinutes} min`
                : 'Availability shown after location selection'}
            </small>
          </span>
          <strong>LIVE</strong>
        </div>
      </div>

      <div className="buy-actions">
        <div className="quantity standalone">
          <button
            aria-label="Decrease quantity"
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
          >
            <Minus />
          </button>
          <span>{quantity}</span>
          <button
            aria-label="Increase quantity"
            disabled={quantity >= maxQuantity}
            onClick={() => setQuantity(Math.min(maxQuantity, quantity + 1))}
          >
            <Plus />
          </button>
        </div>
        <button
          className="primary-btn"
          disabled={unavailable || cartBusy}
          onClick={() => void add(product, quantity)}
        >
          {cartBusy ? 'Adding…' : unavailable ? 'Unavailable' : 'Add to cart'}
        </button>
      </div>

      <p className="safe-copy">
        COD checkout · Pasalho validates stock, price and fulfillment again before order placement.
      </p>
    </div>
  );
}
