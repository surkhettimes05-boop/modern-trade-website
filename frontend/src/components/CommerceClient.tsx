'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image'; import Link from 'next/link';
import { ChevronDown, Heart, MapPin, Menu, MessageCircle, Minus, Plus, Search, ShoppingCart, Star, X } from 'lucide-react';
import { Campaign, formatPrice, mapCategory, mapProduct, Offer, Product, searchProducts, StorefrontCategory, Store, slugify } from '@/lib/catalog';
import { resilientFetch } from '@/lib/resilientFetch';

type CartItem = { product: Product; qty: number };
type DisplayPrice = { sku: string; regularUnitPrice: string; appliedUnitPrice: string; savingPerUnit: string; promotionSnapshot: { id: string; name: string; version: number } | null };
type Membership = { id: string; membership_number: number; founding_number: number | null; tier_key: 'REGISTERED_MEMBER' | 'FOUNDING_1000'; status: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' };
type PricingQuoteItem = Omit<DisplayPrice, 'savingPerUnit'> & { quantity: string; lineDiscount: string; lineTotal: string };
type PricingQuote = { quoteId: string; channel: 'WEB'; items: PricingQuoteItem[]; subtotal: string; discountTotal: string; finalTotal: string; currency: 'NPR'; membershipNumber: number | null; membershipTier: 'REGISTERED_MEMBER' | 'FOUNDING_1000' | null; membershipStatus: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' | 'NOT_MEMBER'; issuedAt: string; expiresAt: string; signedQuoteToken: string };
type ShopContext = { browseOnly: boolean; items: CartItem[]; products: Product[]; categories: StorefrontCategory[]; stores: Store[]; offers: Offer[]; campaigns: Campaign[]; selectedStore: Store | null; setSelectedStore: (store: Store) => void; add: (product: Product) => void; change: (id: string, delta: number) => void; clear: () => void; drawer: boolean; setDrawer: (value: boolean) => void; loading: boolean; catalogAvailable: boolean; authenticated: boolean | null; membership: Membership | null; displayPrices: Record<string, DisplayPrice>; pricingQuote: PricingQuote | null; pricingQuoteNeedsConfirmation: boolean; requirePricingQuoteConfirmation: () => void; confirmPricingQuote: () => void; pricingBusy: boolean; pricingError: string; refreshPricingQuote: () => Promise<PricingQuote>; reloadMemberPricing: () => Promise<void> };
const Ctx = createContext<ShopContext | null>(null);

export function CommerceProvider({ children, browseOnly = false, initialProducts = [], initialCategories = [], initialStores = [], initialOffers = [], initialCampaigns = [] }: { children: React.ReactNode; browseOnly?: boolean; initialProducts?: Product[]; initialCategories?: StorefrontCategory[]; initialStores?: Store[]; initialOffers?: Offer[]; initialCampaigns?: Campaign[] }) {
  const [products, setProducts] = useState<Product[]>(initialProducts); const [categories, setCategories] = useState<StorefrontCategory[]>(initialCategories); const [stores, setStores] = useState<Store[]>(initialStores); const [offers, setOffers] = useState<Offer[]>(initialOffers); const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns); const [loading, setLoading] = useState(!(initialProducts.length && initialCategories.length)); const [catalogAvailable, setCatalogAvailable] = useState(Boolean(initialProducts.length || initialCategories.length || initialStores.length)); const [items, setItems] = useState<CartItem[]>([]); const [drawer, setDrawer] = useState(false); const [selectedStore, setSelectedStoreState] = useState<Store | null>(initialStores.find((store) => !store.is_temporarily_closed) || null); const [hydrated, setHydrated] = useState(false);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [displayPrices, setDisplayPrices] = useState<Record<string, DisplayPrice>>({});
  const [pricingQuote, setPricingQuote] = useState<PricingQuote | null>(null);
  const [pricingQuoteNeedsConfirmation, setPricingQuoteNeedsConfirmation] = useState(false);
  const [pricingBusy, setPricingBusy] = useState(false);
  const [pricingError, setPricingError] = useState('');
  const quoteRequestId = useRef(0);
  const csrf = () => decodeURIComponent(document.cookie.match(/(?:^|; )customer_csrf=([^;]+)/)?.[1] || '');
  const reloadMemberPricing = useCallback(async () => {
    if (authenticated !== true || !selectedStore || !products.length) {
      setMembership(null);
      setDisplayPrices({});
      return;
    }
    const skus = [...new Set(products.map((product) => product.sku).filter((sku): sku is string => Boolean(sku)))];
    if (!skus.length) return;
    const membershipResponse = await resilientFetch('/api/membership/me', {
      credentials: 'include',
      cache: 'no-store',
    });
    const membershipBody = await membershipResponse.json().catch(() => ({}));
    if (!membershipResponse.ok) {
      setMembership(null);
      throw new Error('Membership status is temporarily unavailable.');
    }
    setMembership(membershipBody.membership || null);
    try {
      const pricesResponse = await resilientFetch('/api/customer-pricing/web/prices', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf() },
        body: JSON.stringify({ store_id: selectedStore.id, skus }),
      });
      const priceBody = await pricesResponse.json().catch(() => ({}));
      if (!pricesResponse.ok) throw new Error('Member pricing is temporarily unavailable.');
      setDisplayPrices(Object.fromEntries(
        (Array.isArray(priceBody.prices) ? priceBody.prices : []).map((price: DisplayPrice) => [price.sku, price]),
      ));
    } catch {
      setDisplayPrices({});
    }
  }, [authenticated, products, selectedStore]);
  const requestPricingQuote = useCallback(async (signal?: AbortSignal) => {
    if (authenticated !== true || !selectedStore || !items.length) {
      throw new Error('Sign in, choose a store, and add products before requesting a quote.');
    }
    const requestId = ++quoteRequestId.current;
    const quoteItems = items.map(({ product, qty }) => {
      if (!product.sku) throw new Error(`${product.name} is missing its SKU and cannot be priced.`);
      return { sku: product.sku, quantity: qty };
    });
    const response = await resilientFetch('/api/customer-pricing/web/quotes', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      signal,
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf() },
      body: JSON.stringify({ store_id: selectedStore.id, items: quoteItems }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.quote) {
      if (response.status === 404 && typeof body.error !== 'string') {
        throw new Error('Checkout pricing is unavailable on this backend. Orders are paused until the pricing API is updated.');
      }
      throw new Error(typeof body.error === 'string' ? body.error : 'Could not get an authoritative price quote.');
    }
    if (requestId === quoteRequestId.current) setPricingQuote(body.quote as PricingQuote);
    return body.quote as PricingQuote;
  }, [authenticated, items, selectedStore]);
  const refreshPricingQuote = useCallback(async () => {
    setPricingBusy(true);
    setPricingError('');
    try {
      const quote = await requestPricingQuote();
      return quote;
    } catch (error) {
      setPricingQuote(null);
      setPricingError(error instanceof Error ? error.message : 'Could not get an authoritative price quote.');
      throw error;
    } finally {
      setPricingBusy(false);
    }
  }, [requestPricingQuote]);
  useEffect(() => {
    const controller = new AbortController();
    resilientFetch('/api/auth/session/validate', {
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((response) => setAuthenticated(response.ok))
      .catch(() => { if (!controller.signal.aborted) setAuthenticated(false); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    quoteRequestId.current += 1;
    const timer = window.setTimeout(() => {
      if (!active) return;
      if (authenticated !== true || !selectedStore || !items.length) {
        setPricingQuote(null);
        setPricingQuoteNeedsConfirmation(false);
        setPricingBusy(false);
        setPricingError('');
        return;
      }
      setPricingQuote(null);
      setPricingBusy(true);
      setPricingError('');
      requestPricingQuote(controller.signal)
        .catch((error) => {
          if (active && !controller.signal.aborted) {
            setPricingError(error instanceof Error ? error.message : 'Could not get an authoritative price quote.');
          }
        })
        .finally(() => { if (active) setPricingBusy(false); });
    }, 0);
    return () => { active = false; controller.abort(); window.clearTimeout(timer); };
  }, [authenticated, items, selectedStore, requestPricingQuote]);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      reloadMemberPricing().catch(() => {
        if (active) {
          setDisplayPrices({});
        }
      });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [reloadMemberPricing]);
  useEffect(() => {
    if (!pricingQuote) return;
    const delay = Date.parse(pricingQuote.expiresAt) - Date.now();
    const timer = window.setTimeout(() => {
      setPricingQuoteNeedsConfirmation(true);
      void refreshPricingQuote().catch(() => undefined);
    }, Math.max(0, delay));
    return () => window.clearTimeout(timer);
  }, [pricingQuote, refreshPricingQuote]);
  useEffect(() => { const timer = window.setTimeout(() => { try { const saved = localStorage.getItem('pasalho-cart-v1'); if (saved) setItems(JSON.parse(saved)); const storeId = localStorage.getItem('pasalho-store'); if (storeId) {
    const validStore = initialStores.find((store) => store.id === storeId && !store.is_temporarily_closed);
    if (validStore) setSelectedStoreState(validStore);
    else if (!initialStores.length) setSelectedStoreState({ id: storeId, name: 'Selected store' });
  } } catch { /* ignore malformed browser state */ } finally { setHydrated(true); } }, 0); return () => window.clearTimeout(timer); }, [initialStores]);
  useEffect(() => { if (hydrated) localStorage.setItem('pasalho-cart-v1', JSON.stringify(items)); }, [hydrated, items]);
  useEffect(() => { if (!hydrated || !products.length) return; const timer = window.setTimeout(() => { const productsBySku = new Map(products.map((product) => [product.sku || product.id, product])); setItems((current) => current.flatMap((item) => { const product = productsBySku.get(item.product.sku || item.product.id); return product ? [{ ...item, product }] : []; })); }, 0); return () => window.clearTimeout(timer); }, [hydrated, products]);
  useEffect(() => { if (initialProducts.length && initialCategories.length && initialStores.length) return; const controller = new AbortController(); const fetchArray = async (url: string) => { const response = await resilientFetch(url, { signal: controller.signal, timeoutMs: 5000, retries: 1 }); if (!response.ok) throw new Error(`Catalog request failed (${response.status})`); const body: unknown = await response.json(); if (!Array.isArray(body)) throw new Error('Catalog response is invalid'); return body; }; Promise.all([fetchArray('/api/public/products?limit=2500'), fetchArray('/api/public/categories'), fetchArray('/api/public/stores'), fetchArray('/api/public/offers')]).then(([productRows, categoryRows, storeRows, offerRows]) => { const nextStores = storeRows as Store[]; const apiProducts = (productRows as Record<string, unknown>[]).map(mapProduct).filter((p) => p.price > 0); const apiCategories = (categoryRows as Record<string, unknown>[]).map(mapCategory); setProducts(apiProducts); setCategories(apiCategories); setStores(nextStores); setOffers(offerRows as Offer[]); void fetchArray('/api/public/campaigns?channel=WEB').then((campaignRows) => setCampaigns(campaignRows as Campaign[])).catch(() => setCampaigns([])); setCatalogAvailable(true); setSelectedStoreState((current) => current?.id && nextStores.find((s) => s.id === current.id && !s.is_temporarily_closed) || nextStores.find((s) => !s.is_temporarily_closed) || null); }).catch(() => { if (!controller.signal.aborted) { setProducts([]); setCategories([]); setStores([]); setOffers([]); setCampaigns([]); setCatalogAvailable(false); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [initialCategories.length, initialProducts.length, initialStores.length]);
  const selected = (store: Store) => { setSelectedStoreState(store); localStorage.setItem('pasalho-store', store.id); };
  const add = (product: Product) => { if (browseOnly) return; setItems((current) => { const found = current.find((item) => item.product.id === product.id); return found ? current.map((item) => item.product.id === product.id ? { ...item, qty: item.qty + 1 } : item) : [...current, { product, qty: 1 }]; }); setDrawer(true); };
  const change = (id: string, delta: number) => setItems((current) => current.map((item) => item.product.id === id ? { ...item, qty: item.qty + delta } : item).filter((item) => item.qty > 0));
  const clear = () => { setItems([]); setPricingQuoteNeedsConfirmation(false); setDrawer(false); };
  const requirePricingQuoteConfirmation = () => setPricingQuoteNeedsConfirmation(true);
  const confirmPricingQuote = () => setPricingQuoteNeedsConfirmation(false);
  return <Ctx.Provider value={{ browseOnly, items, products, categories, stores, offers, campaigns, selectedStore, setSelectedStore: selected, add, change, clear, drawer, setDrawer, loading, catalogAvailable, authenticated, membership, displayPrices, pricingQuote, pricingQuoteNeedsConfirmation, requirePricingQuoteConfirmation, confirmPricingQuote, pricingBusy, pricingError, refreshPricingQuote, reloadMemberPricing }}>{children}{!browseOnly && <CartDrawer />}</Ctx.Provider>;
}
export const useShop = () => { const value = useContext(Ctx); if (!value) throw new Error('shop provider missing'); return value; };

export function SearchBox() {
  const { products } = useShop();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const result = useMemo(() => searchProducts(products, query).slice(0, 8), [products, query]);
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

export function ProductCard({ product, compact = false }: { product: Product; compact?: boolean }) {
  const { add, browseOnly, displayPrices, membership } = useShop();
  const price = product.sku ? displayPrices[product.sku] : undefined;
  const eligible = membership?.status === 'ACTIVE' && Boolean(membership.tier_key) && price && Number(price.appliedUnitPrice) < Number(price.regularUnitPrice);
  const save = product.originalPrice ? Math.round((1 - product.price / product.originalPrice) * 100) : 0;
  return <article className={`product-card ${compact ? 'compact' : ''}`}>
    <div className="product-image"><Link href={`/product/${product.slug}`}><Image src={product.image} fill sizes="(max-width: 600px) 70vw, 260px" alt={product.name} /></Link>{save ? <span className="deal-badge">Save {save}%</span> : null}{!browseOnly && <button className="wish" aria-label={`Wishlist ${product.name}`}><Heart size={19} /></button>}</div>
    <div className="product-copy"><span className="brand">{product.brand}</span><Link href={`/product/${product.slug}`}><h3>{product.name}</h3></Link><div className="rating"><Star size={14} fill="currentColor" /> {product.rating || '—'} <span>({product.reviews})</span></div>
      <div className="price-row"><div><strong>{eligible ? formatPrice(Number(price.appliedUnitPrice)) : formatPrice(product.price)}</strong>{eligible ? <><del>{formatPrice(Number(price.regularUnitPrice))}</del><small className="block text-emerald-800">{membership.tier_key === 'FOUNDING_1000' ? 'Founding 1,000 price' : 'Member price'} · Save {formatPrice(Number(price.savingPerUnit))}</small>{price.promotionSnapshot && <small className="block text-slate-500">{price.promotionSnapshot.name}</small>}</> : product.originalPrice ? <del>{formatPrice(product.originalPrice)}</del> : null}</div></div>
      <p className="stock">● {product.availability}</p>
      <button className="add-btn" onClick={() => add(product)} disabled={browseOnly || product.availability.toLowerCase().includes('out of')}>{browseOnly ? 'Ordering opens soon' : <><Plus size={18} /> Add to cart</>}</button>
    </div>
  </article>;
}
export function Quantity({ id, qty }: { id: string; qty: number }) { const { change } = useShop(); return <div className="quantity"><button onClick={() => change(id, -1)} aria-label="Decrease quantity"><Minus size={16} /></button><span>{qty}</span><button onClick={() => change(id, 1)} aria-label="Increase quantity"><Plus size={16} /></button></div>; }
export function CartButton() { const { items, setDrawer, browseOnly } = useShop(); if (browseOnly) return null; const count = items.reduce((n, item) => n + item.qty, 0); return <button className="nav-action" onClick={() => setDrawer(true)} aria-label={`Cart with ${count} items`}><ShoppingCart /><span>Cart</span>{count ? <i>{count}</i> : null}</button>; }
function CartDrawer() {
  const { items, drawer, setDrawer, authenticated, pricingQuote, pricingBusy, pricingError } = useShop();
  const subtotal = pricingQuote ? Number(pricingQuote.finalTotal) : authenticated === false ? items.reduce((n, item) => n + item.product.price * item.qty, 0) : 0;
  const quoteLines = new Map(pricingQuote?.items.map((line) => [line.sku, line]) || []);
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
  return <><button className="drawer-backdrop" onClick={() => setDrawer(false)} aria-label="Close cart" /><aside className="cart-drawer open" role="dialog" aria-modal="true" aria-labelledby="cart-drawer-title" ref={dialogRef}><header><div><p className="eyebrow">Your basket</p><h2 id="cart-drawer-title">Cart ({items.length})</h2></div><button onClick={() => setDrawer(false)} aria-label="Close" ref={closeRef}><X /></button></header>{items.length ? <><div className="drawer-items">{items.map((item) => { const line = item.product.sku ? quoteLines.get(item.product.sku) : undefined; return <div className="drawer-item" key={item.product.id}><Image src={item.product.image} width={80} height={80} alt="" /><div><b>{item.product.name}</b><strong>{line ? formatPrice(Number(line.lineTotal)) : authenticated === false ? formatPrice(item.product.price * item.qty) : pricingBusy ? 'Updating price…' : 'Price unavailable'}</strong>{line && <small className="block text-slate-500">Regular {formatPrice(Number(line.regularUnitPrice))} · Applied {formatPrice(Number(line.appliedUnitPrice))}</small>}<Quantity id={item.product.id} qty={item.qty} /></div></div>; })}</div><div className="drawer-summary"><p><span>Payable</span><strong>{pricingBusy ? 'Updating price…' : pricingQuote || authenticated === false ? formatPrice(subtotal) : 'Price unavailable'}</strong></p>{pricingQuote && <p className="text-sm text-emerald-800">Member savings {formatPrice(Number(pricingQuote.discountTotal))}</p>}{pricingError && <p role="alert" className="text-sm text-red-700">{pricingError}</p>}<Link href="/cart" onClick={() => setDrawer(false)} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#168b52] px-5 py-3 font-bold text-white"><ShoppingCart size={19} /> Review cart & checkout</Link><Link href="/whatsapp-order" onClick={() => setDrawer(false)} className="mt-3 flex items-center justify-center gap-2 text-center text-sm font-bold text-emerald-800"><MessageCircle size={17} /> Order through WhatsApp</Link></div></> : <div className="empty-cart"><ShoppingCart size={48} /><h3>Your cart is ready for good things</h3><button className="primary-btn" onClick={() => setDrawer(false)}>Start shopping</button></div>}</aside></>;
}
export function MobileNav() { const { items, setDrawer, browseOnly } = useShop(); return <nav className="mobile-nav"><Link href="/">⌂<span>Home</span></Link><Link href="/shop"><Menu /><span>Categories</span></Link><button onClick={() => document.querySelector<HTMLInputElement>('.search-box input')?.focus()}><Search /><span>Search</span></button>{!browseOnly && <><Link href="/account"><Heart /><span>Wishlist</span></Link><button onClick={() => setDrawer(true)}><ShoppingCart /><span>Cart {items.length ? `(${items.length})` : ''}</span></button></>}</nav>; }
export function LocationPicker() { const { stores, selectedStore, setSelectedStore } = useShop(); return <label className="location-picker"><MapPin /><span><small>Showing availability near</small><select value={selectedStore?.id || ''} onChange={(e) => { const store = stores.find((s) => s.id === e.target.value); if (store) setSelectedStore(store); }} aria-label="Choose store"><option value="">Select a store</option>{stores.map((store) => <option key={store.id} value={store.id} disabled={store.is_temporarily_closed}>{store.name}{store.is_temporarily_closed ? ' — temporarily closed' : ''}</option>)}</select></span><ChevronDown /></label>; }
