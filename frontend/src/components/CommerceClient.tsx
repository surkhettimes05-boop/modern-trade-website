'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronDown, Heart, MapPin, Menu, Minus, Plus, Search, ShoppingCart, Star, X } from 'lucide-react';
import { formatPrice, mapCommerceProduct, openingCategories, openingProducts, Product, StorefrontCategory, Store, slugify } from '@/lib/catalog';
import { CommerceApiError, commerceFetch } from '@/lib/commerceApi';

type CartItem = { product: Product; qty: number };
type Coordinates = { latitude: number; longitude: number };
type Serviceability = {
  serviceable: boolean;
  serviceZone?: { id: string; code: string; name: string };
  fulfillment?: { locationId: string; branchId: string; storeName: string; branchName: string };
  delivery?: { etaMinMinutes: number; etaMaxMinutes: number; deliveryFee: number; freeDeliveryThreshold: number | null; minOrder: number };
  reason?: string;
};
type ProductList = { items: Record<string, unknown>[]; total: number; page: number; limit: number };

type ShopContext = {
  items: CartItem[];
  products: Product[];
  categories: StorefrontCategory[];
  stores: Store[];
  selectedStore: Store | null;
  serviceZoneId: string | null;
  coordinates: Coordinates | null;
  deliveryEta: string | null;
  setSelectedStore: (store: Store) => void;
  resolveCurrentLocation: () => Promise<void>;
  add: (product: Product) => void;
  change: (id: string, delta: number) => void;
  clearCart: () => void;
  drawer: boolean;
  setDrawer: (value: boolean) => void;
  loading: boolean;
  locationLoading: boolean;
  locationError: string;
};

const Ctx = createContext<ShopContext | null>(null);
const LOCATION_KEY = 'pasalho-location-v1';
const CART_KEY = 'pasalho-cart-v1';

export function CommerceProvider({
  children,
  initialProducts = [],
  initialCategories = [],
}: {
  children: React.ReactNode;
  initialProducts?: Product[];
  initialCategories?: StorefrontCategory[];
  initialStores?: Store[];
}) {
  const [products, setProducts] = useState<Product[]>(initialProducts.length ? initialProducts : openingProducts);
  const [categories, setCategories] = useState<StorefrontCategory[]>(initialCategories.length ? initialCategories : openingCategories);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<CartItem[]>([]);
  const [drawer, setDrawer] = useState(false);
  const [selectedStore, setSelectedStoreState] = useState<Store | null>(null);
  const [serviceZoneId, setServiceZoneId] = useState<string | null>(null);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [deliveryEta, setDeliveryEta] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [hydrated, setHydrated] = useState(false);

  const loadLiveCatalog = async (locationId: string) => {
    setLoading(true);
    try {
      const [productPage, categoryRows] = await Promise.all([
        commerceFetch<ProductList>(
          `/api/commerce/products?locationId=${encodeURIComponent(locationId)}&page=1&limit=200`,
          {},
          { auth: false },
        ),
        commerceFetch<Array<{ id: string; name: string; slug: string; imageUrl?: string | null }>>(
          `/api/commerce/categories?locationId=${encodeURIComponent(locationId)}`,
          {},
          { auth: false },
        ),
      ]);
      const liveProducts = productPage.items.map(mapCommerceProduct).filter((product) => product.price > 0);
      setProducts(liveProducts);
      setCategories(categoryRows.map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        image: category.imageUrl || undefined,
      })));
      setItems((current) => current.flatMap((item) => {
        const product = liveProducts.find((candidate) => candidate.id === item.product.id);
        if (!product) return [];
        return [{ ...item, product, qty: Math.min(item.qty, Math.max(1, Math.floor(product.maxOrderQuantity ?? item.qty))) }];
      }));
    } catch (error) {
      setProducts(openingProducts);
      setCategories(openingCategories);
      setLocationError(error instanceof Error ? error.message : 'Could not load live Pasalho inventory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const savedCart = localStorage.getItem(CART_KEY);
        if (savedCart) setItems(JSON.parse(savedCart) as CartItem[]);

        const savedLocation = localStorage.getItem(LOCATION_KEY);
        if (savedLocation) {
          const parsed = JSON.parse(savedLocation) as {
            latitude: number;
            longitude: number;
            serviceZoneId: string;
            locationId: string;
            storeName: string;
            etaMinMinutes?: number;
            etaMaxMinutes?: number;
          };
          setCoordinates({ latitude: parsed.latitude, longitude: parsed.longitude });
          setServiceZoneId(parsed.serviceZoneId);
          const store = { id: parsed.locationId, name: parsed.storeName };
          setSelectedStoreState(store);
          setStores([store]);
          if (parsed.etaMinMinutes != null && parsed.etaMaxMinutes != null) {
            setDeliveryEta(`${parsed.etaMinMinutes}–${parsed.etaMaxMinutes} min`);
          }
          void loadLiveCatalog(parsed.locationId);
        }
      } catch {
        localStorage.removeItem(CART_KEY);
        localStorage.removeItem(LOCATION_KEY);
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(CART_KEY, JSON.stringify(items));
  }, [hydrated, items]);

  const resolveCurrentLocation = async () => {
    setLocationLoading(true);
    setLocationError('');
    try {
      if (!navigator.geolocation) throw new Error('Location is not supported on this device.');
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12_000,
          maximumAge: 60_000,
        });
      });
      const nextCoordinates = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      const resolved = await commerceFetch<Serviceability>(
        '/api/commerce/serviceability/resolve',
        {
          method: 'POST',
          body: JSON.stringify(nextCoordinates),
        },
        { auth: false },
      );
      if (!resolved.serviceable || !resolved.serviceZone || !resolved.fulfillment) {
        throw new Error(
          resolved.reason === 'FULFILLMENT_LOCATION_UNAVAILABLE'
            ? 'Pasalho does not have an active fulfillment store for this area yet.'
            : 'This address is outside the current Pasalho delivery zone.',
        );
      }

      const store: Store = {
        id: resolved.fulfillment.locationId,
        name: resolved.fulfillment.storeName,
      };
      if (selectedStore?.id && selectedStore.id !== store.id) setItems([]);
      setCoordinates(nextCoordinates);
      setSelectedStoreState(store);
      setStores([store]);
      setServiceZoneId(resolved.serviceZone.id);
      setDeliveryEta(resolved.delivery ? `${resolved.delivery.etaMinMinutes}–${resolved.delivery.etaMaxMinutes} min` : null);
      localStorage.setItem(LOCATION_KEY, JSON.stringify({
        ...nextCoordinates,
        serviceZoneId: resolved.serviceZone.id,
        locationId: store.id,
        storeName: store.name,
        etaMinMinutes: resolved.delivery?.etaMinMinutes,
        etaMaxMinutes: resolved.delivery?.etaMaxMinutes,
      }));
      await loadLiveCatalog(store.id);
    } catch (error) {
      const message = error instanceof GeolocationPositionError
        ? 'Location permission is required to show live Pasalho stock.'
        : error instanceof CommerceApiError || error instanceof Error
          ? error.message
          : 'Could not resolve your delivery location.';
      setLocationError(message);
    } finally {
      setLocationLoading(false);
    }
  };

  const selected = (store: Store) => {
    if (store.id !== selectedStore?.id) setItems([]);
    setSelectedStoreState(store);
    setStores([store]);
    void loadLiveCatalog(store.id);
  };

  const add = (product: Product) => {
    if (!product.isLive || !selectedStore) return;
    setItems((current) => {
      const found = current.find((item) => item.product.id === product.id);
      const max = Math.max(1, Math.floor(product.maxOrderQuantity ?? 999));
      if (found) {
        return current.map((item) => item.product.id === product.id
          ? { ...item, qty: Math.min(max, item.qty + 1) }
          : item);
      }
      return [...current, { product, qty: 1 }];
    });
    setDrawer(true);
  };

  const change = (id: string, delta: number) => setItems((current) => current
    .map((item) => {
      if (item.product.id !== id) return item;
      const max = Math.max(1, Math.floor(item.product.maxOrderQuantity ?? 999));
      return { ...item, qty: Math.min(max, item.qty + delta) };
    })
    .filter((item) => item.qty > 0));

  const clearCart = () => setItems([]);

  return <Ctx.Provider value={{
    items,
    products,
    categories,
    stores,
    selectedStore,
    serviceZoneId,
    coordinates,
    deliveryEta,
    setSelectedStore: selected,
    resolveCurrentLocation,
    add,
    change,
    clearCart,
    drawer,
    setDrawer,
    loading,
    locationLoading,
    locationError,
  }}>{children}<CartDrawer /></Ctx.Provider>;
}

export const useShop = () => {
  const value = useContext(Ctx);
  if (!value) throw new Error('shop provider missing');
  return value;
};

export function SearchBox() {
  const { products } = useShop();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const result = useMemo(
    () => products.filter((p) => `${p.name} ${p.brand} ${p.category}`.toLowerCase().includes(query.toLowerCase())).slice(0, 6),
    [products, query],
  );
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  return <div className="search-wrap" ref={wrapperRef}><label className="search-box"><Search size={21} /><input value={query} onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="Search milk, rice, shampoo, biscuits…" aria-label="Search products" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls="product-search-results" /><kbd>⌘ K</kbd></label>{open && <div className="search-panel" role="listbox" id="product-search-results">{result.length ? result.map((p) => <Link href={`/product/${p.slug}`} className="search-result" key={p.id} onClick={() => setOpen(false)} role="option"><Image src={p.image} alt="" width={56} height={56} /><span><b>{p.name}</b><small>{p.category}</small></span><strong>{formatPrice(p.price)}</strong></Link>) : <p className="p-4 text-sm text-slate-500">No matching products.</p>}</div>}</div>;
}

export function MegaMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { categories } = useShop();
  const [active, setActive] = useState<StorefrontCategory | null>(null);
  const current = active || categories[0];
  if (!open) return null;
  return <div className="mega" role="dialog" aria-label="Shop categories"><div className="mega-depts">{categories.slice(0, 8).map((category) => <button className={current?.id === category.id ? 'active' : ''} onMouseEnter={() => setActive(category)} onFocus={() => setActive(category)} key={category.id}>{category.name}<span>›</span></button>)}</div><div><p className="eyebrow">Explore {current?.name}</p><div className="mega-links"><Link onClick={onClose} href={current ? `/category/${current.slug || slugify(current.name)}` : '/shop'}>Shop all</Link><Link onClick={onClose} href="/offers">Offers</Link></div></div></div>;
}

export function ProductCard({ product, compact = false }: { product: Product; compact?: boolean }) {
  const { add, selectedStore } = useShop();
  const save = product.originalPrice ? Math.round((1 - product.price / product.originalPrice) * 100) : 0;
  const unavailable = product.availability.toLowerCase().includes('out of');
  const canOrder = Boolean(product.isLive && selectedStore && product.unitId && !unavailable);
  return <article className={`product-card ${compact ? 'compact' : ''}`}><div className="product-image"><Link href={`/product/${product.slug}`}><Image src={product.image} fill sizes="(max-width: 600px) 70vw, 260px" alt={product.name} /></Link>{save ? <span className="deal-badge">Save {save}%</span> : null}<button className="wish" aria-label={`Wishlist ${product.name}`}><Heart size={19} /></button></div><div className="product-copy"><span className="brand">{product.brand}</span><Link href={`/product/${product.slug}`}><h3>{product.name}</h3></Link><div className="rating"><Star size={14} /> {product.rating || '—'} <span>{product.reviews ? `(${product.reviews})` : ''}</span></div><div className="price-row"><strong>{formatPrice(product.price)}</strong>{product.originalPrice ? <del>{formatPrice(product.originalPrice)}</del> : null}</div><p className="stock">● {product.availability}</p><button className="add-btn" onClick={() => add(product)} disabled={!canOrder}><Plus size={18} /> {canOrder ? 'Add' : product.isLive ? 'Unavailable' : 'Set location'}</button></div></article>;
}

export function Quantity({ id, qty }: { id: string; qty: number }) {
  const { change } = useShop();
  return <div className="quantity"><button onClick={() => change(id, -1)} aria-label="Decrease quantity"><Minus size={16} /></button><span>{qty}</span><button onClick={() => change(id, 1)} aria-label="Increase quantity"><Plus size={16} /></button></div>;
}

export function CartButton() {
  const { items, setDrawer } = useShop();
  const count = items.reduce((n, item) => n + item.qty, 0);
  return <button className="nav-action" onClick={() => setDrawer(true)} aria-label={`Cart with ${count} items`}><ShoppingCart /><span>Cart</span>{count ? <i>{count}</i> : null}</button>;
}

function CartDrawer() {
  const { items, drawer, setDrawer } = useShop();
  const subtotal = items.reduce((n, item) => n + item.product.price * item.qty, 0);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!drawer) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawer(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
      previousFocus?.focus();
    };
  }, [drawer, setDrawer]);

  if (!drawer) return null;
  return <><button className="drawer-backdrop" onClick={() => setDrawer(false)} aria-label="Close cart" /><aside className="cart-drawer open" role="dialog" aria-modal="true" aria-labelledby="cart-drawer-title" ref={dialogRef}><header><div><p className="eyebrow">Your basket</p><h2 id="cart-drawer-title">Cart ({items.length})</h2></div><button onClick={() => setDrawer(false)} aria-label="Close" ref={closeRef}><X /></button></header>{items.length ? <><div className="drawer-items">{items.map((item) => <div className="drawer-item" key={item.product.id}><Image src={item.product.image} width={80} height={80} alt="" /><div><b>{item.product.name}</b><strong>{formatPrice(item.product.price)}</strong><Quantity id={item.product.id} qty={item.qty} /></div></div>)}</div><div className="drawer-summary"><p><span>Subtotal</span><strong>{formatPrice(subtotal)}</strong></p><Link href="/checkout" onClick={() => setDrawer(false)} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#168b52] px-5 py-3 font-bold text-white">Checkout</Link><Link href="/cart" onClick={() => setDrawer(false)} className="mt-3 block text-center text-sm font-bold text-emerald-800">View and edit cart</Link></div></> : <div className="empty-cart"><ShoppingCart size={48} /><h3>Your cart is ready for good things</h3><button className="primary-btn" onClick={() => setDrawer(false)}>Start shopping</button></div>}</aside></>;
}

export function MobileNav() {
  const { items, setDrawer } = useShop();
  return <nav className="mobile-nav"><Link href="/">⌂<span>Home</span></Link><Link href="/shop"><Menu /><span>Categories</span></Link><button onClick={() => document.querySelector<HTMLInputElement>('.search-box input')?.focus()}><Search /><span>Search</span></button><Link href="/account"><Heart /><span>Account</span></Link><button onClick={() => setDrawer(true)}><ShoppingCart /><span>Cart {items.length ? `(${items.length})` : ''}</span></button></nav>;
}

export function LocationPicker() {
  const { selectedStore, resolveCurrentLocation, locationLoading, locationError, deliveryEta } = useShop();
  return <div className="location-picker"><MapPin /><span><small>{selectedStore ? 'Delivering from' : 'Live inventory needs your location'}</small><b>{selectedStore?.name || 'Set delivery location'}</b>{deliveryEta && <small>ETA {deliveryEta}</small>}</span><button type="button" onClick={() => void resolveCurrentLocation()} disabled={locationLoading}>{locationLoading ? 'Locating…' : selectedStore ? 'Refresh' : 'Use my location'}</button>{locationError && <span className="sr-only">{locationError}</span>}<ChevronDown /></div>;
}
