'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image'; import Link from 'next/link';
import { ChevronDown, Heart, MapPin, Menu, MessageCircle, Minus, Plus, Search, ShoppingCart, Star, X } from 'lucide-react';
import { formatPrice, mapProduct, openingCategories, openingProducts, Product, StorefrontCategory, Store, slugify } from '@/lib/catalog';
import { resilientFetch } from '@/lib/resilientFetch';

type CartItem = { product: Product; qty: number };
type ShopContext = { items: CartItem[]; products: Product[]; categories: StorefrontCategory[]; stores: Store[]; selectedStore: Store | null; setSelectedStore: (store: Store) => void; add: (product: Product) => void; change: (id: string, delta: number) => void; drawer: boolean; setDrawer: (value: boolean) => void; loading: boolean };
const Ctx = createContext<ShopContext | null>(null);

export function CommerceProvider({ children, initialProducts = [], initialCategories = [], initialStores = [] }: { children: React.ReactNode; initialProducts?: Product[]; initialCategories?: StorefrontCategory[]; initialStores?: Store[] }) {
  const [products, setProducts] = useState<Product[]>(initialProducts); const [categories, setCategories] = useState<StorefrontCategory[]>(initialCategories); const [stores, setStores] = useState<Store[]>(initialStores); const [loading, setLoading] = useState(!(initialProducts.length && initialCategories.length)); const [items, setItems] = useState<CartItem[]>([]); const [drawer, setDrawer] = useState(false); const [selectedStore, setSelectedStoreState] = useState<Store | null>(initialStores[0] || null); const [hydrated, setHydrated] = useState(false);
  useEffect(() => { const timer = window.setTimeout(() => { try { const saved = localStorage.getItem('novamart-cart-v2'); if (saved) setItems(JSON.parse(saved)); const storeId = localStorage.getItem('novamart-store'); if (storeId) setSelectedStoreState({ id: storeId, name: 'Selected store' }); } catch { /* ignore malformed browser state */ } finally { setHydrated(true); } }, 0); return () => window.clearTimeout(timer); }, []);
  useEffect(() => { if (hydrated) localStorage.setItem('novamart-cart-v2', JSON.stringify(items)); }, [hydrated, items]);
  useEffect(() => { if (!hydrated || !products.length) return; const timer = window.setTimeout(() => { const productsBySku = new Map(products.map((product) => [product.sku || product.id, product])); setItems((current) => current.flatMap((item) => { const product = productsBySku.get(item.product.sku || item.product.id); return product ? [{ ...item, product }] : []; })); }, 0); return () => window.clearTimeout(timer); }, [hydrated, products]);
  useEffect(() => { if (initialProducts.length && initialCategories.length && initialStores.length) return; const controller = new AbortController(); Promise.all([resilientFetch('/api/public/products', { signal: controller.signal, timeoutMs: 5000, retries: 1 }).then((r) => r.ok ? r.json() : []), resilientFetch('/api/public/categories', { signal: controller.signal, timeoutMs: 5000, retries: 1 }).then((r) => r.ok ? r.json() : []), resilientFetch('/api/public/stores', { signal: controller.signal, timeoutMs: 5000, retries: 1 }).then((r) => r.ok ? r.json() : [])]).then(([productRows, categoryRows, storeRows]) => { const nextStores = storeRows as Store[]; const apiProducts = (productRows as Record<string, unknown>[]).map(mapProduct).filter((p) => p.price > 0); const apiCategories = categoryRows as StorefrontCategory[]; const bySlug = new Map(apiCategories.map((c) => [c.slug, c])); setProducts(apiProducts.length ? apiProducts : openingProducts); setCategories(openingCategories.map((opening) => ({ ...opening, ...bySlug.get(opening.slug), id: opening.id })).concat(apiCategories.filter((c) => !openingCategories.some((opening) => opening.slug === c.slug)))); setStores(nextStores); setSelectedStoreState((current) => current?.id && nextStores.find((s) => s.id === current.id) || nextStores[0] || null); }).catch(() => { if (!controller.signal.aborted) { setProducts(openingProducts); setCategories(openingCategories); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [initialCategories.length, initialProducts.length, initialStores.length]);
  const selected = (store: Store) => { setSelectedStoreState(store); localStorage.setItem('novamart-store', store.id); };
  const add = (product: Product) => { setItems((current) => { const found = current.find((item) => item.product.id === product.id); return found ? current.map((item) => item.product.id === product.id ? { ...item, qty: item.qty + 1 } : item) : [...current, { product, qty: 1 }]; }); setDrawer(true); };
  const change = (id: string, delta: number) => setItems((current) => current.map((item) => item.product.id === id ? { ...item, qty: item.qty + delta } : item).filter((item) => item.qty > 0));
  return <Ctx.Provider value={{ items, products, categories, stores, selectedStore, setSelectedStore: selected, add, change, drawer, setDrawer, loading }}>{children}<CartDrawer /></Ctx.Provider>;
}
export const useShop = () => { const value = useContext(Ctx); if (!value) throw new Error('shop provider missing'); return value; };

export function SearchBox() {
  const { products } = useShop();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const result = useMemo(() => products.filter((p) => `${p.name} ${p.brand} ${p.category}`.toLowerCase().includes(query.toLowerCase())).slice(0, 6), [products, query]);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  return <div className="search-wrap" ref={wrapperRef} onKeyDown={(event) => { if (event.key === 'Escape') { setOpen(false); (event.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus(); } }}><label className="search-box"><Search size={21} /><input value={query} onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="Search products, brands and categories" aria-label="Search products" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls="product-search-results" /><kbd>⌘ K</kbd></label>{open && <div className="search-panel" role="listbox" id="product-search-results" aria-label="Product search results">{result.length ? result.map((p) => <Link href={`/product/${p.slug}`} className="search-result" key={p.id} onClick={() => setOpen(false)} role="option" aria-selected="false"><Image src={p.image} alt="" width={56} height={56} /><span><b>{p.name}</b><small>{p.category}</small></span><strong>{formatPrice(p.price)}</strong></Link>) : <p className="p-4 text-sm text-slate-500">No matching products.</p>}</div>}</div>;
}

export function MegaMenu({ open, onClose }: { open: boolean; onClose: () => void }) { const { categories } = useShop(); const [active, setActive] = useState<StorefrontCategory | null>(null); const current = active || categories[0]; if (!open) return null; return <div className="mega" role="dialog" aria-label="Shop categories"><div className="mega-depts">{categories.slice(0, 8).map((category) => <button className={current?.id === category.id ? 'active' : ''} onMouseEnter={() => setActive(category)} onFocus={() => setActive(category)} key={category.id}>{category.name}<span>›</span></button>)}</div><div><p className="eyebrow">Explore {current?.name}</p><div className="mega-links"><Link onClick={onClose} href={current ? `/category/${current.slug || slugify(current.name)}` : '/shop'}>Shop all</Link><Link onClick={onClose} href="/offers">Offers</Link></div></div></div>; }

export function ProductCard({ product, compact = false }: { product: Product; compact?: boolean }) { const { add } = useShop(); const save = product.originalPrice ? Math.round((1 - product.price / product.originalPrice) * 100) : 0; return <article className={`product-card ${compact ? 'compact' : ''}`}><div className="product-image"><Link href={`/product/${product.slug}`}><Image src={product.image} fill sizes="(max-width: 600px) 70vw, 260px" alt={product.name} /></Link>{save ? <span className="deal-badge">Save {save}%</span> : null}<button className="wish" aria-label={`Wishlist ${product.name}`}><Heart size={19} /></button></div><div className="product-copy"><span className="brand">{product.brand}</span><Link href={`/product/${product.slug}`}><h3>{product.name}</h3></Link><div className="rating"><Star size={14} fill="currentColor" /> {product.rating || '—'} <span>({product.reviews})</span></div><div className="price-row"><strong>{formatPrice(product.price)}</strong>{product.originalPrice ? <del>{formatPrice(product.originalPrice)}</del> : null}</div><p className="stock">● {product.availability}</p><button className="add-btn" onClick={() => add(product)} disabled={product.availability.toLowerCase().includes('out of')}><Plus size={18} /> Add to cart</button></div></article>; }
export function Quantity({ id, qty }: { id: string; qty: number }) { const { change } = useShop(); return <div className="quantity"><button onClick={() => change(id, -1)} aria-label="Decrease quantity"><Minus size={16} /></button><span>{qty}</span><button onClick={() => change(id, 1)} aria-label="Increase quantity"><Plus size={16} /></button></div>; }
export function CartButton() { const { items, setDrawer } = useShop(); const count = items.reduce((n, item) => n + item.qty, 0); return <button className="nav-action" onClick={() => setDrawer(true)} aria-label={`Cart with ${count} items`}><ShoppingCart /><span>Cart</span>{count ? <i>{count}</i> : null}</button>; }
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
  return <><button className="drawer-backdrop" onClick={() => setDrawer(false)} aria-label="Close cart" /><aside className="cart-drawer open" role="dialog" aria-modal="true" aria-labelledby="cart-drawer-title" ref={dialogRef}><header><div><p className="eyebrow">Your basket</p><h2 id="cart-drawer-title">Cart ({items.length})</h2></div><button onClick={() => setDrawer(false)} aria-label="Close" ref={closeRef}><X /></button></header>{items.length ? <><div className="drawer-items">{items.map((item) => <div className="drawer-item" key={item.product.id}><Image src={item.product.image} width={80} height={80} alt="" /><div><b>{item.product.name}</b><strong>{formatPrice(item.product.price)}</strong><Quantity id={item.product.id} qty={item.qty} /></div></div>)}</div><div className="drawer-summary"><p><span>Subtotal</span><strong>{formatPrice(subtotal)}</strong></p><Link href="/whatsapp-order" onClick={() => setDrawer(false)} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#168b52] px-5 py-3 font-bold text-white"><MessageCircle size={19} /> Order on WhatsApp</Link><Link href="/cart" onClick={() => setDrawer(false)} className="mt-3 block text-center text-sm font-bold text-emerald-800">View and edit cart</Link></div></> : <div className="empty-cart"><ShoppingCart size={48} /><h3>Your cart is ready for good things</h3><button className="primary-btn" onClick={() => setDrawer(false)}>Start shopping</button></div>}</aside></>;
}
export function MobileNav() { const { items, setDrawer } = useShop(); return <nav className="mobile-nav"><Link href="/">⌂<span>Home</span></Link><Link href="/shop"><Menu /><span>Categories</span></Link><button onClick={() => document.querySelector<HTMLInputElement>('.search-box input')?.focus()}><Search /><span>Search</span></button><Link href="/account"><Heart /><span>Wishlist</span></Link><button onClick={() => setDrawer(true)}><ShoppingCart /><span>Cart {items.length ? `(${items.length})` : ''}</span></button></nav>; }
export function LocationPicker() { const { stores, selectedStore, setSelectedStore } = useShop(); return <label className="location-picker"><MapPin /><span><small>Showing availability near</small><select value={selectedStore?.id || ''} onChange={(e) => { const store = stores.find((s) => s.id === e.target.value); if (store) setSelectedStore(store); }} aria-label="Choose store"><option value="">Select a store</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></span><ChevronDown /></label>; }
