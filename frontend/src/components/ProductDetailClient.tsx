'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { Heart, Minus, Plus, ShoppingBag, Truck } from 'lucide-react';
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
  const { add, displayPrices, membership } = useShop();
  const [quantity, setQuantity] = useState(1);
  const save = product.originalPrice ? Math.round((1 - product.price / product.originalPrice) * 100) : 0;
  const memberPrice = product.sku ? displayPrices[product.sku] : undefined;
  const memberEligible = membership?.status === 'ACTIVE' && Boolean(membership.tier_key) && memberPrice && Number(memberPrice.appliedUnitPrice) < Number(memberPrice.regularUnitPrice);
  const unavailable = product.availability.toLowerCase().includes('out of');
  return <div className="buy-box">
    <span className="brand">{product.brand}</span><h1>{product.name}</h1>
    <div className="pdp-rating">★ {product.rating || '—'} <a href="#reviews">{product.reviews} reviews</a></div>
    <div className="pdp-price"><strong>{memberEligible ? formatPrice(Number(memberPrice.appliedUnitPrice)) : formatPrice(product.price)}</strong>{memberEligible ? <><del>{formatPrice(Number(memberPrice.regularUnitPrice))}</del><span>{membership.tier_key === 'FOUNDING_1000' ? 'Founding 1,000 price' : 'Member price'}</span><small className="block">Save {formatPrice(Number(memberPrice.savingPerUnit))} per unit</small>{memberPrice.promotionSnapshot && <small className="block text-slate-500">{memberPrice.promotionSnapshot.name}</small>}</> : product.originalPrice && <><del>{formatPrice(product.originalPrice)}</del><span>Save {save}%</span></>}</div>
    <small>Inclusive of all taxes · {product.unit}</small>
    <div className="availability"><b>● {product.availability}</b><span>Based on your selected store</span></div>
    <div className="fulfilment"><div><Truck /><span><b>Delivery</b><small>Eligibility shown at checkout</small></span><strong>CHECK</strong></div><div><ShoppingBag /><span><b>Store pickup</b><small>Ready time depends on store stock</small></span><strong>CHECK</strong></div></div>
    <div className="buy-actions"><div className="quantity standalone"><button aria-label="Decrease quantity" onClick={() => setQuantity(Math.max(1, quantity - 1))}><Minus /></button><span>{quantity}</span><button aria-label="Increase quantity" onClick={() => setQuantity(quantity + 1)}><Plus /></button></div><button className="primary-btn" disabled={unavailable} onClick={() => Array.from({ length: quantity }).forEach(() => add(product))}>Add to cart</button></div>
    <button className="wishlist-btn" aria-label="Save to wishlist"><Heart /> Save to wishlist</button><p className="safe-copy">COD checkout · Store-based fulfilment · Pasalho quality promise</p>
  </div>;
}
