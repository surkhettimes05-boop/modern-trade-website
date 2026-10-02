'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image'; import Link from 'next/link';
import { House, MapPin, Menu, Minus, Plus, Search, ShoppingCart, UserRound, X } from 'lucide-react';
import { formatPrice, mapProduct, openingCategories, openingProducts, Product, StorefrontCategory, slugify } from '@/lib/catalog';
import { resilientFetch } from '@/lib/resilientFetch';
import { trackStorefrontEvent } from '@/lib/analytics';

type CartItem = { product: Product; qty: number; backendItemId?: string };
type ShopContext = { items: CartItem[]; products: Product[]; categories: StorefrontCategory[]; add: (product: Product) => void; change: (id: string, delta: number) => void; flushCartWrites: () => Promise<string | null>; clearCart: () => void; cartId: string | null; drawer: boolean; setDrawer: (value: boolean) => void; loading: boolean };
const Ctx = createContext<ShopContext | null>(null);

function csrfToken() {
  return decodeURIComponent(document.cookie.match(/(?:^|; )customer_csrf=([^;]+)/)?.[1] || '');
}

async function authenticatedCart() {
  const session = await resilientFetch('/api/auth/session/validate', { credentials: 'include', cache: 'no-store', retries: 0 });
  if (!session.ok) return null;
  const response = await resilientFetch('/api/shopping-cart', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken() }, body: JSON.stringify({}) });
  if (!response.ok) return null;
  return await response.json() as { id: string };
}

export function CommerceProvider({ children, initialProducts = [], initialCategories = [], initialCatalogLoaded = false }: { children: React.ReactNode; initialProducts?: Product[]; initialCategories?: StorefrontCategory[]; initialCatalogLoaded?: boolean }) {
  const [products, setProducts] = useState<Product[]>(initialProducts); const [categories, setCategories] = useState<StorefrontCategory[]>(initialCategories); const [loading, setLoading] = useState(!initialCatalogLoaded); const [items, setItems] = useState<CartItem[]>([]); const [cartId, setCartId] = useState<string | null>(null); const [drawer, setDrawer] = useState(false); const [hydrated, setHydrated] = useState(false);
  const cartIdRef = useRef<string | null>(null);
  const cartWriteQueue = useRef<Promise<void>>(Promise.resolve());
  const cartWriteError = useRef<string | null>(null);
  useEffect(() => { const timer = window.setTimeout(() => { try { const saved = localStorage.getItem('pasalho-cart-v2'); if (saved) setItems((current) => { const restored = JSON.parse(saved) as CartItem[]; const merged = new Map(restored.map((item) => [item.product.sku || item.product.id, item])); for (const item of current) { const key = item.product.sku || item.product.id; const prior = merged.get(key); merged.set(key, prior ? { ...item, qty: prior.qty + item.qty } : item); } return [...merged.values()]; }); localStorage.removeItem('pasalho-store'); } catch { /* ignore malformed browser state */ } finally { setHydrated(true); } }, 0); return () => window.clearTimeout(timer); }, []);
  useEffect(() => { if (hydrated) localStorage.setItem('pasalho-cart-v2', JSON.stringify(items)); }, [hydrated, items]);
  useEffect(() => { if (!hydrated || !products.length) return; const timer = window.setTimeout(() => { const productsBySku = new Map(products.map((product) => [product.sku || product.id, product])); setItems((current) => current.flatMap((item) => { const product = productsBySku.get(item.product.sku || item.product.id); return product ? [{ ...item, product }] : []; })); }, 0); return () => window.clearTimeout(timer); }, [hydrated, products]);
  useEffect(() => { if (initialCatalogLoaded) return; const controller = new AbortController(); Promise.all([resilientFetch('/api/public/products', { signal: controller.signal, timeoutMs: 5000, retries: 1 }).then((r) => r.ok ? r.json() : []), resilientFetch('/api/public/categories', { signal: controller.signal, timeoutMs: 5000, retries: 1 }).then((r) => r.ok ? r.json() : [])]).then(([productRows, categoryRows]) => { const apiProducts = (productRows as Record<string, unknown>[]).map(mapProduct).filter((p) => p.price > 0); const apiCategories = categoryRows as StorefrontCategory[]; const bySlug = new Map(apiCategories.map((c) => [c.slug, c])); setProducts(apiProducts.length || process.env.NODE_ENV === 'production' ? apiProducts : openingProducts); setCategories(openingCategories.map((opening) => ({ ...opening, ...bySlug.get(opening.slug), id: opening.id })).concat(apiCategories.filter((c) => !openingCategories.some((opening) => opening.slug === c.slug)))); }).catch(() => { if (!controller.signal.aborted && process.env.NODE_ENV !== 'production') { setProducts(openingProducts); setCategories(openingCategories); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [initialCatalogLoaded]);
  const add = (product: Product) => {
    trackStorefrontEvent('ADD_TO_CART', { product_id: product.id, product_name: product.name, quantity: 1 });
    setItems((current) => {
      const found = current.find((item) => item.product.id === product.id);
      return found ? current.map((item) => item.product.id === product.id ? { ...item, qty: item.qty + 1 } : item) : [...current, { product, qty: 1 }];
    });
    setDrawer(true);
    cartWriteQueue.current = cartWriteQueue.current.then(async () => {
      const cart = cartIdRef.current ? { id: cartIdRef.current } : await authenticatedCart();
      if (!cart) return;
      cartIdRef.current = cart.id;
      setCartId(cart.id);
      const response = await resilientFetch(`/api/shopping-cart/${cart.id}/items`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken() }, body: JSON.stringify({ product_id: product.id, quantity: 1 }) });
      if (!response.ok) throw new Error('Could not sync cart item');
      const item = await response.json() as { id: string };
      setItems((current) => current.map((entry) => entry.product.id === product.id ? { ...entry, backendItemId: item.id } : entry));
    }).catch((error: unknown) => {
      cartWriteError.current = error instanceof Error ? error.message : 'Could not sync cart';
    });
  };
  const flushCartWrites = async () => {
    await cartWriteQueue.current;
    // Reconcile absolute quantities even when an earlier optimistic write failed.
    const activeCart = await authenticatedCart();
    const activeCartId = activeCart?.id;
    if (!activeCartId) return null;
    cartIdRef.current = activeCartId;
    setCartId(activeCartId);
    const response = await resilientFetch(`/api/shopping-cart/${activeCartId}/items`, { credentials: 'include', cache: 'no-store' });
    if (!response.ok) throw new Error('Could not verify your cart');
    const backendItems = await response.json() as { id: string; product_id: string; quantity: number }[];
    const desired = new Map(items.map((item) => [item.product.id, item.qty]));
    const existing = new Map(backendItems.map((item) => [item.product_id, item]));
    for (const [productId, item] of existing) {
      const quantity = desired.get(productId);
      if (quantity === undefined) {
        const remove = await resilientFetch(`/api/shopping-cart/items/${item.id}`, { method: 'DELETE', credentials: 'include', headers: { 'x-csrf-token': csrfToken() } });
        if (!remove.ok) throw new Error('Could not verify your cart');
      } else if (quantity !== Number(item.quantity)) {
        const update = await resilientFetch(`/api/shopping-cart/items/${item.id}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken() }, body: JSON.stringify({ quantity }) });
        if (!update.ok) throw new Error('Could not verify your cart');
        desired.delete(productId);
      } else {
        desired.delete(productId);
      }
    }
    for (const [productId, quantity] of desired) {
      const addResponse = await resilientFetch(`/api/shopping-cart/${activeCartId}/items`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken() }, body: JSON.stringify({ product_id: productId, quantity }) });
      if (!addResponse.ok) throw new Error('Could not verify your cart');
    }
    cartWriteError.current = null;
    return activeCartId;
  };
  const change = (id: string, delta: number) => {
    const current = items.find((item) => item.product.id === id);
    if (!current) return;
    const quantity = current.qty + delta;
    setItems((entries) => entries.map((item) => item.product.id === id ? { ...item, qty: quantity } : item).filter((item) => item.qty > 0));
    trackStorefrontEvent(quantity > 0 ? 'ADD_TO_CART' : 'REMOVE_FROM_CART', { product_id: id, quantity: Math.max(quantity, 0) });
    void (async () => {
      if (!current.backendItemId) return;
      if (quantity > 0) {
        await resilientFetch(`/api/shopping-cart/items/${current.backendItemId}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken() }, body: JSON.stringify({ quantity }) });
      } else {
        await resilientFetch(`/api/shopping-cart/items/${current.backendItemId}`, { method: 'DELETE', credentials: 'include', headers: { 'x-csrf-token': csrfToken() } });
      }
    })().catch(() => undefined);
  };
  return <Ctx.Provider value={{ items, products, categories, add, change, flushCartWrites, clearCart: () => { setItems([]); setCartId(null); cartIdRef.current = null; setDrawer(false); localStorage.removeItem("pasalho-cart-v2"); }, cartId, drawer, setDrawer, loading: loading || !hydrated }}>{children}<div className="storefront cart-layer"><CartDrawer /></div></Ctx.Provider>;
}
export const useShop = () => { const value = useContext(Ctx); if (!value) throw new Error('shop provider missing'); return value; };

export function SearchBox() {
  const { products } = useShop();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [remoteSearch, setRemoteSearch] = useState<{ query: string; products: Product[] }>({ query: '', products: [] });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const keyboardShortcut = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? '⌘ K' : 'Ctrl K';
  const localResults = useMemo(() => products.filter((p) => `${p.name} ${p.brand} ${p.category}`.toLowerCase().includes(query.toLowerCase())).slice(0, 6), [products, query]);
  useEffect(() => {
    const term = query.trim();
    if (!term) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      trackStorefrontEvent('SEARCH', { query: term });
      const params = new URLSearchParams({ q: term, limit: '6' });
      resilientFetch(`/api/public/products?${params.toString()}`, { signal: controller.signal, timeoutMs: 5000, retries: 1 })
        .then((response) => response.ok ? response.json() : [])
        .then((rows: unknown) => setRemoteSearch({ query: term, products: Array.isArray(rows) ? rows.map((row) => mapProduct(row as Record<string, unknown>)).filter((product) => product.price > 0) : [] }))
        .catch(() => { if (!controller.signal.aborted) setRemoteSearch({ query: term, products: [] }); });
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);
  const result = query.trim() ? (remoteSearch.query === query.trim() && remoteSearch.products.length ? remoteSearch.products : localResults) : [];
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  return <div className="search-wrap" ref={wrapperRef} onKeyDown={(event) => { if (event.key === 'Escape') { setOpen(false); (event.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus(); } }}><label className="search-box"><Search size={22} strokeWidth={2} /><input value={query} onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="Search products, brands and categories" aria-label="Search products" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls="product-search-results" /><kbd>{keyboardShortcut}</kbd></label>{open && <div className="search-panel" role="listbox" id="product-search-results" aria-label="Product search results">{result.length ? result.map((p) => <Link href={`/product/${p.slug}`} className="search-result" key={p.id} onClick={() => setOpen(false)} role="option" aria-selected="false"><Image src={p.image} alt="" width={56} height={56} /><span><b>{p.name}</b><small>{p.category}</small></span><strong>{formatPrice(p.price)}</strong></Link>) : <p className="p-4 text-sm text-slate-500">No matching products.</p>}</div>}</div>;
}

export function MegaMenu({ open, onClose }: { open: boolean; onClose: () => void }) { const { categories } = useShop(); const [active, setActive] = useState<StorefrontCategory | null>(null); const current = active || categories[0]; if (!open) return null; return <div className="mega" role="dialog" aria-label="Shop categories"><div className="mega-depts">{categories.slice(0, 8).map((category) => <button className={current?.id === category.id ? 'active' : ''} onMouseEnter={() => setActive(category)} onFocus={() => setActive(category)} key={category.id}>{category.name}<span>›</span></button>)}</div><div><p className="eyebrow">Explore {current?.name}</p><div className="mega-links"><Link onClick={onClose} href={current ? `/category/${current.slug || slugify(current.name)}` : '/shop'}>Shop all</Link><Link onClick={onClose} href="/offers">Offers</Link></div></div></div>; }

export function ProductCard({ product, compact = false }: { product: Product; compact?: boolean }) {
  const { add, items, loading } = useShop();
  const qty = items.find(item => item.product.id === product.id)?.qty || 0;
  const original = product.originalPrice && product.originalPrice > product.price ? product.originalPrice : null;
  const unavailable = product.availability.toLowerCase().includes('out of');
  return <article className={`product-card ${compact ? 'compact' : ''}`}><div className="product-image"><Link href={`/product/${product.slug}`} aria-label={`View ${product.name}`}><Image src={product.image || '/placeholder-product.svg'} fill sizes="(max-width: 600px) 150px, 200px" alt={product.name} /></Link>{original ? <span className="deal-badge">{Math.round((1-product.price/original)*100)}% OFF</span> : null}</div><div className="product-copy"><span className="brand">{product.brand || 'Everyday essential'}</span><Link href={`/product/${product.slug}`}><h3>{product.name}</h3></Link><p className="unit">{product.unit || 'Standard pack'}</p><div className="card-buy"><div className="price-row"><strong>{formatPrice(product.price)}</strong>{original ? <del>{formatPrice(original)}</del> : null}</div>{qty ? <Quantity id={product.id} qty={qty} /> : <button className="add-btn" onClick={() => add(product)} disabled={unavailable || loading} aria-label={`Add ${product.name} to cart`}>{unavailable ? 'Sold out' : 'ADD'}</button>}</div></div></article>;
}
export function Quantity({ id, qty }: { id: string; qty: number }) { const { change } = useShop(); return <div className="quantity"><button onClick={() => change(id, -1)} aria-label="Decrease quantity"><Minus size={16} strokeWidth={2} /></button><span>{qty}</span><button onClick={() => change(id, 1)} aria-label="Increase quantity"><Plus size={16} strokeWidth={2} /></button></div>; }
export function CartButton() { const { items, setDrawer } = useShop(); const count = items.reduce((n, item) => n + item.qty, 0); return <button className="nav-action" onClick={() => setDrawer(true)} aria-label={`Cart with ${count} items`}><ShoppingCart size={21} strokeWidth={2} /><span>Cart</span>{count ? <i>{count}</i> : null}</button>; }
function CartDrawer() {
  const { items, drawer, setDrawer } = useShop();
  const subtotal = items.reduce((n, item) => n + item.product.price * item.qty, 0);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!drawer) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const background = [document.querySelector('header.site-header'), document.querySelector('main'), document.querySelector('footer')].filter((element): element is HTMLElement => element instanceof HTMLElement);
    background.forEach((element) => element.setAttribute('inert', ''));
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setDrawer(false);
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      background.forEach((element) => element.removeAttribute('inert'));
      document.body.style.overflow = priorOverflow;
      previousFocus?.focus();
    };
  }, [drawer, setDrawer]);

  if (!drawer) return null;
  return <><button className="drawer-backdrop" onClick={() => setDrawer(false)} aria-label="Close cart" /><aside className="cart-drawer open" role="dialog" aria-modal="true" aria-labelledby="cart-drawer-title" ref={dialogRef}><header><div><p className="eyebrow">Your basket</p><h2 id="cart-drawer-title">Cart ({items.length})</h2></div><button onClick={() => setDrawer(false)} aria-label="Close" ref={closeRef}><X /></button></header>{items.length ? <><div className="drawer-items">{items.map((item) => <div className="drawer-item" key={item.product.id}><Image src={item.product.image} width={80} height={80} alt="" /><div><b>{item.product.name}</b><strong>{formatPrice(item.product.price)}</strong><Quantity id={item.product.id} qty={item.qty} /></div></div>)}</div><div className="drawer-summary"><p><span>Subtotal</span><strong>{formatPrice(subtotal)}</strong></p><Link href="/checkout" onClick={() => setDrawer(false)} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#168b52] px-5 py-3 font-bold text-white"><ShoppingCart size={19} /> Continue with COD checkout</Link><Link href="/cart" onClick={() => setDrawer(false)} className="mt-3 block text-center text-sm font-bold text-emerald-800">View and edit cart</Link></div></> : <div className="empty-cart"><ShoppingCart size={48} /><h3>Your cart is ready for good things</h3><button className="primary-btn" onClick={() => setDrawer(false)}>Start shopping</button></div>}</aside></>;
}
export function MobileNav() { const { items, setDrawer } = useShop(); const count = items.reduce((n, item) => n + item.qty, 0); const subtotal = items.reduce((n, item) => n + item.product.price * item.qty, 0); return <>{count > 0 && <button className="mobile-basket" onClick={() => setDrawer(true)}><span><ShoppingCart size={20} /> {count} {count === 1 ? 'item' : 'items'} · {formatPrice(subtotal)}</span><strong>View basket →</strong></button>}<nav className="mobile-nav" aria-label="Quick navigation"><Link href="/"><House size={20} strokeWidth={2} /><span>Home</span></Link><Link href="/shop"><Menu size={20} strokeWidth={2} /><span>Categories</span></Link><button onClick={() => document.querySelector<HTMLInputElement>('.search-box input')?.focus()} aria-label="Search"><Search size={20} strokeWidth={2} /><span>Search</span></button><Link href="/account" aria-label="Account"><UserRound size={20} strokeWidth={2} /><span>Account</span></Link><button onClick={() => setDrawer(true)} aria-label={`Cart with ${count} items`}><ShoppingCart size={20} strokeWidth={2} /><span>Cart {items.length ? `(${items.length})` : ''}</span></button></nav></>; }
export function DeliveryLocation() { return <div className="location-picker" aria-label="Delivery location"><MapPin size={18} strokeWidth={2} /><span><small>Delivery location</small><strong>Choose an address at checkout</strong></span></div>; }

