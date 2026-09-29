'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { Heart, Minus, Plus, ShoppingBag, Truck } from 'lucide-react';
import { formatPrice, Product } from '@/lib/catalog';
import { trackStorefrontEvent } from '@/lib/analytics';
import { useShop } from './CommerceClient';

export function ProductGallery({ product }: { product: Product }) {
  const [zoom, setZoom] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!zoom) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setZoom(false); }
      if (event.key === 'Tab') { event.preventDefault(); closeRef.current?.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    const trigger = triggerRef.current;
    return () => { document.removeEventListener('keydown', onKeyDown); trigger?.focus(); };
  }, [zoom]);

  return <div className="gallery">
    <button ref={triggerRef} className="gallery-main" onClick={() => setZoom(true)} aria-label="Zoom product image">
      <Image src={product.image} fill priority sizes="(max-width:800px) 100vw, 50vw" alt={product.name} /><span>Click to zoom</span>
    </button>
    {zoom && <div className="lightbox" role="dialog" aria-modal="true" aria-label="Product image preview" onClick={() => setZoom(false)}>
      <Image src={product.image} width={900} height={900} alt={product.name} />
      <button ref={closeRef} aria-label="Close" onClick={() => setZoom(false)}>Close</button>
    </div>}
  </div>;
}

export function BuyBox({ product }: { product: Product }) {
  const { add } = useShop();
  const [quantity, setQuantity] = useState(1);
  const genuineOriginalPrice = product.originalPrice && product.originalPrice > product.price ? product.originalPrice : null;
  const save = genuineOriginalPrice ? Math.round((1 - product.price / genuineOriginalPrice) * 100) : 0;
  const hasReviews = product.rating > 0 && product.reviews > 0;
  const unavailable = product.availability.toLowerCase().includes('out of');
  useEffect(() => { trackStorefrontEvent('PRODUCT_VIEWED', { product_id: product.id, product_name: product.name }); }, [product.id, product.name]);
  return <div className="buy-box">
    <span className="brand">{product.brand}</span><h1>{product.name}</h1>
    {hasReviews ? <div className="pdp-rating">★ {product.rating} <span>{product.reviews} reviews</span></div> : null}
    <div className="pdp-price"><strong>{formatPrice(product.price)}</strong>{genuineOriginalPrice && <><del>{formatPrice(genuineOriginalPrice)}</del><span>Save {save}%</span></>}</div>
    <small>Inclusive of all taxes{product.unit ? ` · ${product.unit}` : ''}</small>
    <div className="availability"><b>● Stock confirmed at checkout</b><span>Central warehouse fulfillment</span></div>
    <div className="fulfilment"><div><Truck /><span><b>Home delivery</b><small>Availability confirmed after order placement</small></span><strong>CHECK</strong></div></div>
    <div className="buy-actions"><div className="quantity standalone"><button aria-label="Decrease quantity" onClick={() => setQuantity(Math.max(1, quantity - 1))}><Minus /></button><span>{quantity}</span><button aria-label="Increase quantity" onClick={() => setQuantity(quantity + 1)}><Plus /></button></div><button className="primary-btn" disabled={unavailable} onClick={() => { Array.from({ length: quantity }).forEach(() => add(product)); trackStorefrontEvent('ADD_TO_CART', { product_id: product.id, quantity }); }}>Add to cart</button></div>
    <button className="wishlist-btn" aria-label="Save to wishlist"><Heart /> Save to wishlist</button><p className="safe-copy">COD checkout · Store-based fulfilment · PASALHO quality promise</p>
  </div>;
}
