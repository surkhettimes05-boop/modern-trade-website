'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ChevronDown,
  LoaderCircle,
  LocateFixed,
  MapPin,
  Menu,
  Minus,
  Plus,
  Search,
  ShoppingCart,
  X,
} from 'lucide-react';
import {
  formatPrice,
  Product,
  Store,
  StorefrontCategory,
  slugify,
} from '@/lib/catalog';
import {
  addServerCartItem,
  createServerCart,
  fetchPasalhoCatalog,
  fetchServerCart,
  removeServerCartItem,
  resolveDeliveryLocation,
  searchPasalhoCatalog,
  updateServerCartItem,
  type DeliveryContext,
  type ServerCart,
} from '@/lib/pasalhoCommerce';

type CartItem = {
  product: Product;
  qty: number;
  cartItemId?: string;
};

type ShopContext = {
  items: CartItem[];
  products: Product[];
  categories: StorefrontCategory[];
  stores: Store[];
  selectedStore: Store | null;
  delivery: DeliveryContext | null;
  setSelectedStore: (store: Store) => void;
  requestLocation: () => void;
  add: (product: Product, quantity?: number) => Promise<void>;
  change: (id: string, delta: number) => Promise<void>;
  drawer: boolean;
  setDrawer: (value: boolean) => void;
  loading: boolean;
  cartBusy: boolean;
  message: string;
  cartToken: string;
  clearCart: () => void;
};

const Ctx = createContext<ShopContext | null>(null);
const DELIVERY_KEY = 'pasalho-delivery-context-v1';
const CART_KEY = 'pasalho-cart-token-v1';

function productFromServerCartItem(
  item: ServerCart['items'][number],
  known?: Product,
): Product {
  if (known) return known;
  return {
    id: item.productId,
    slug: slugify(item.product.name),
    sku: item.product.skuCode,
    name: item.product.name,
    brand: '',
    category: 'Everyday essentials',
    description: '',
    image: item.product.imageUrl || '/placeholder-product.svg',
    price: Number(item.price?.sellingPrice ?? 0),
    originalPrice:
      item.price && Number(item.price.mrp) > Number(item.price.sellingPrice)
        ? Number(item.price.mrp)
        : undefined,
    rating: 0,
    reviews: 0,
    availability: String(item.availability?.state || 'AVAILABLE').replaceAll(
      '_',
      ' ',
    ),
    tags: [],
    unit: item.unit?.symbol,
    specifications: {
      SKU: item.product.skuCode || '—',
      Pack: item.unit?.symbol || '—',
      Department: 'Everyday essentials',
    },
    defaultUnitId: item.unitId,
    maxOrderQuantity: item.availability?.maxOrderQuantity,
    source: 'pasalho',
  };
}

export function CommerceProvider({
  children,
  initialProducts = [],
  initialCategories = [],
  initialStores = [],
}: {
  children: React.ReactNode;
  initialProducts?: Product[];
  initialCategories?: StorefrontCategory[];
  initialStores?: Store[];
}) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [categories, setCategories] =
    useState<StorefrontCategory[]>(initialCategories);
  const [stores] = useState<Store[]>(initialStores);
  const [selectedStore, setSelectedStoreState] = useState<Store | null>(
    initialStores.find((store) => store.source === 'pasalho') || null,
  );
  const [delivery, setDelivery] = useState<DeliveryContext | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [serverCartToken, setServerCartToken] = useState('');
  const [drawer, setDrawer] = useState(false);
  const [locationDialog, setLocationDialog] = useState(false);
  const [loading, setLoading] = useState(initialProducts.length === 0);
  const [cartBusy, setCartBusy] = useState(false);
  const [message, setMessage] = useState('');

  const syncCart = (cart: ServerCart, productList = products) => {
    const productMap = new Map(productList.map((product) => [product.id, product]));
    setItems(
      cart.items.map((item) => ({
        cartItemId: item.id,
        product: productFromServerCartItem(
          item,
          productMap.get(item.productId),
        ),
        qty: Number(item.quantity),
      })),
    );
  };

  const loadCatalog = async (locationId: string) => {
    setLoading(true);
    try {
      const catalog = await fetchPasalhoCatalog(locationId);
      setProducts(catalog.products);
      setCategories(catalog.categories);
      return catalog.products;
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Could not load this store catalogue.',
      );
      return products;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      try {
        const savedDelivery = localStorage.getItem(DELIVERY_KEY);
        const savedCart = localStorage.getItem(CART_KEY);
        let restoredProducts = products;

        if (savedDelivery) {
          const context = JSON.parse(savedDelivery) as DeliveryContext;
          if (!cancelled) {
            setDelivery(context);
            setSelectedStoreState({
              id: context.locationId,
              name: context.storeName,
              source: 'pasalho',
              serviceZoneId: context.serviceZoneId,
            });
          }
          restoredProducts = await loadCatalog(context.locationId);
        }

        if (savedCart) {
          const cart = await fetchServerCart(savedCart);
          if (!cancelled) {
            setServerCartToken(cart.cartToken);
            syncCart(cart, restoredProducts);
          }
        }
      } catch {
        localStorage.removeItem(CART_KEY);
      } finally {
        if (!cancelled && initialProducts.length === 0) setLoading(false);
      }
    };
    void restore();
    return () => {
      cancelled = true;
    };
    // Initial browser restoration only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setSelectedStore = (store: Store) => {
    setSelectedStoreState(store);
    if (store.source !== 'pasalho') {
      setDelivery(null);
      localStorage.removeItem(DELIVERY_KEY);
    }
  };

  const applyDelivery = async (context: DeliveryContext) => {
    const changedStore = selectedStore?.id !== context.locationId;
    setDelivery(context);
    setSelectedStoreState({
      id: context.locationId,
      name: context.storeName,
      source: 'pasalho',
      serviceZoneId: context.serviceZoneId,
    });
    localStorage.setItem(DELIVERY_KEY, JSON.stringify(context));
    setLocationDialog(false);
    setMessage('');
    await loadCatalog(context.locationId);

    if (changedStore) {
      setItems([]);
      setServerCartToken('');
      localStorage.removeItem(CART_KEY);
    }
  };

  const ensureServerCart = async () => {
    if (serverCartToken) return serverCartToken;
    if (!delivery) {
      setLocationDialog(true);
      throw new Error('Set your delivery location before adding items.');
    }
    const cart = await createServerCart(delivery);
    setServerCartToken(cart.cartToken);
    localStorage.setItem(CART_KEY, cart.cartToken);
    syncCart(cart);
    return cart.cartToken;
  };

  const add = async (product: Product, quantity = 1) => {
    if (!delivery) {
      setLocationDialog(true);
      setMessage('Set your delivery location to check stock and add items.');
      return;
    }
    if (product.source !== 'pasalho') {
      setMessage(
        'Choose your delivery location to load live Pasalho store inventory.',
      );
      setLocationDialog(true);
      return;
    }

    setCartBusy(true);
    setMessage('');
    try {
      const token = await ensureServerCart();
      const cart = await addServerCartItem(token, product, quantity);
      syncCart(cart);
      setDrawer(true);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Could not update your cart.',
      );
    } finally {
      setCartBusy(false);
    }
  };

  const clearCart = () => {
    setItems([]);
    setServerCartToken('');
    localStorage.removeItem(CART_KEY);
    setDrawer(false);
  };

  const change = async (productId: string, delta: number) => {
    const current = items.find((item) => item.product.id === productId);
    if (!current || !serverCartToken || !current.cartItemId || cartBusy) return;

    const nextQuantity = current.qty + delta;
    setCartBusy(true);
    setMessage('');
    try {
      const cart =
        nextQuantity <= 0
          ? await removeServerCartItem(serverCartToken, current.cartItemId)
          : await updateServerCartItem(
              serverCartToken,
              current.cartItemId,
              nextQuantity,
            );
      syncCart(cart);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Could not update your cart.',
      );
    } finally {
      setCartBusy(false);
    }
  };

  return (
    <Ctx.Provider
      value={{
        items,
        products,
        categories,
        stores,
        selectedStore,
        delivery,
        setSelectedStore,
        requestLocation: () => setLocationDialog(true),
        add,
        change,
        drawer,
        setDrawer,
        loading,
        cartBusy,
        message,
        cartToken: serverCartToken,
        clearCart,
      }}
    >
      {children}
      <CartDrawer />
      <LocationDialog
        open={locationDialog}
        onClose={() => setLocationDialog(false)}
        onResolved={applyDelivery}
      />
    </Ctx.Provider>
  );
}

export const useShop = () => {
  const value = useContext(Ctx);
  if (!value) throw new Error('shop provider missing');
  return value;
};

export function SearchBox() {
  const { products, selectedStore } = useShop();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<Product[] | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const local = useMemo(
    () =>
      products
        .filter((product) =>
          `${product.name} ${product.brand} ${product.category}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .slice(0, 8),
    [products, query],
  );

  useEffect(() => {
    if (
      query.trim().length < 2 ||
      !selectedStore ||
      selectedStore.source !== 'pasalho'
    ) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      searchPasalhoCatalog(selectedStore.id, query.trim())
        .then((results) => {
          if (!controller.signal.aborted) setRemote(results);
        })
        .catch(() => {
          if (!controller.signal.aborted) setRemote(null);
        });
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, selectedStore]);

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);

  const remoteEligible =
    query.trim().length >= 2 &&
    selectedStore?.source === 'pasalho';
  const result = remoteEligible && remote ? remote : local;

  return (
    <div
      className="search-wrap pasalho-search-wrap"
      ref={wrapperRef}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpen(false);
          (
            event.currentTarget.querySelector('input') as HTMLInputElement | null
          )?.focus();
        }
      }}
    >
      <label className="search-box pasalho-search">
        <Search size={20} />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setRemote(null);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search for rice, milk, shampoo..."
          aria-label="Search Pasalho products"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="product-search-results"
        />
      </label>
      {open && query && (
        <div
          className="search-panel"
          role="listbox"
          id="product-search-results"
          aria-label="Product search results"
        >
          {result.length ? (
            result.map((product) => (
              <Link
                href={`/product/${product.slug}`}
                className="search-result"
                key={product.id}
                onClick={() => setOpen(false)}
                role="option"
                aria-selected="false"
              >
                <Image
                  src={product.image}
                  alt=""
                  width={56}
                  height={56}
                />
                <span>
                  <b>{product.name}</b>
                  <small>{product.unit || product.category}</small>
                </span>
                <strong>{formatPrice(product.price)}</strong>
              </Link>
            ))
          ) : (
            <p className="p-4 text-sm text-slate-500">
              No matching products in this store.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function MegaMenu({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { categories } = useShop();
  if (!open) return null;
  return (
    <div className="mega pasalho-mega" role="dialog" aria-label="Shop categories">
      {categories.slice(0, 12).map((category) => (
        <Link
          onClick={onClose}
          href={`/category/${category.slug || slugify(category.name)}`}
          key={category.id}
        >
          {category.name}
        </Link>
      ))}
    </div>
  );
}

export function ProductCard({
  product,
  compact = false,
}: {
  product: Product;
  compact?: boolean;
}) {
  const { add, items, cartBusy, requestLocation, delivery } = useShop();
  const cartItem = items.find((item) => item.product.id === product.id);
  const save = product.originalPrice
    ? Math.round((1 - product.price / product.originalPrice) * 100)
    : 0;
  const unavailable = product.availability.toLowerCase().includes('out of');

  return (
    <article className={`product-card quick-product-card ${compact ? 'compact' : ''}`}>
      <div className="product-image">
        <Link href={`/product/${product.slug}`}>
          <Image
            src={product.image}
            fill
            sizes="(max-width: 600px) 44vw, 190px"
            alt={product.name}
          />
        </Link>
        {save > 0 ? <span className="deal-badge">{save}% OFF</span> : null}
      </div>
      <div className="product-copy">
        <span className="product-pack">{product.unit || 'Pack'}</span>
        <Link href={`/product/${product.slug}`}>
          <h3>{product.name}</h3>
        </Link>
        {product.brand ? <span className="brand">{product.brand}</span> : null}
        <div className="quick-price-row">
          <div>
            <strong>{formatPrice(product.price)}</strong>
            {product.originalPrice ? (
              <del>{formatPrice(product.originalPrice)}</del>
            ) : null}
          </div>
          {cartItem ? (
            <Quantity id={product.id} qty={cartItem.qty} />
          ) : (
            <button
              className="quick-add"
              disabled={unavailable || cartBusy}
              onClick={() => {
                if (!delivery) {
                  requestLocation();
                  return;
                }
                void add(product);
              }}
            >
              {unavailable ? 'OUT' : 'ADD'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export function Quantity({ id, qty }: { id: string; qty: number }) {
  const { change, cartBusy } = useShop();
  return (
    <div className="quantity quick-quantity">
      <button
        onClick={() => void change(id, -1)}
        aria-label="Decrease quantity"
        disabled={cartBusy}
      >
        <Minus size={15} />
      </button>
      <span>{qty}</span>
      <button
        onClick={() => void change(id, 1)}
        aria-label="Increase quantity"
        disabled={cartBusy}
      >
        <Plus size={15} />
      </button>
    </div>
  );
}

export function CartButton() {
  const { items, setDrawer } = useShop();
  const count = items.reduce((total, item) => total + item.qty, 0);
  return (
    <button
      className="pasalho-cart-button"
      onClick={() => setDrawer(true)}
      aria-label={`Cart with ${count} items`}
    >
      <ShoppingCart />
      <span>
        {count ? `${count} item${count === 1 ? '' : 's'}` : 'My cart'}
      </span>
    </button>
  );
}

function CartDrawer() {
  const { items, drawer, setDrawer, delivery, cartBusy, message } = useShop();
  const subtotal = items.reduce(
    (total, item) => total + item.product.price * item.qty,
    0,
  );
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!drawer) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const background = [
      document.querySelector('header.site-header'),
      document.querySelector('main'),
      document.querySelector('footer'),
    ].filter(
      (element): element is HTMLElement => element instanceof HTMLElement,
    );
    background.forEach((element) => element.setAttribute('inert', ''));
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setDrawer(false);
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

  return (
    <>
      <button
        className="drawer-backdrop"
        onClick={() => setDrawer(false)}
        aria-label="Close cart"
      />
      <aside
        className="cart-drawer open"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
        ref={dialogRef}
      >
        <header>
          <div>
            <p className="eyebrow">PASALHO BASKET</p>
            <h2 id="cart-drawer-title">
              {items.length ? 'Ready when you are' : 'Your basket is empty'}
            </h2>
            {delivery ? (
              <small>
                From {delivery.storeName} · {delivery.etaMinMinutes}–
                {delivery.etaMaxMinutes} min estimate
              </small>
            ) : null}
          </div>
          <button
            onClick={() => setDrawer(false)}
            aria-label="Close"
            ref={closeRef}
          >
            <X />
          </button>
        </header>

        {message ? <p className="cart-message">{message}</p> : null}

        {items.length ? (
          <>
            <div className="drawer-items">
              {items.map((item) => (
                <div className="drawer-item" key={item.product.id}>
                  <Image
                    src={item.product.image}
                    width={72}
                    height={72}
                    alt=""
                  />
                  <div>
                    <b>{item.product.name}</b>
                    <small>{item.product.unit}</small>
                    <strong>{formatPrice(item.product.price)}</strong>
                    <Quantity id={item.product.id} qty={item.qty} />
                  </div>
                </div>
              ))}
            </div>
            <div className="drawer-summary">
              <p>
                <span>Item subtotal</span>
                <strong>{formatPrice(subtotal)}</strong>
              </p>
              <Link
                href="/checkout"
                onClick={() => setDrawer(false)}
                className="primary-btn"
                aria-disabled={cartBusy}
              >
                Go to checkout
              </Link>
              <Link
                href="/cart"
                onClick={() => setDrawer(false)}
                className="cart-secondary-link"
              >
                View basket
              </Link>
            </div>
          </>
        ) : (
          <div className="empty-cart">
            <ShoppingCart size={44} />
            <h3>Add your everyday essentials</h3>
            <button
              className="primary-btn"
              onClick={() => setDrawer(false)}
            >
              Browse products
            </button>
          </div>
        )}
      </aside>
    </>
  );
}

function LocationDialog({
  open,
  onClose,
  onResolved,
}: {
  open: boolean;
  onClose: () => void;
  onResolved: (context: DeliveryContext) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const locate = () => {
    if (!navigator.geolocation) {
      setError('Location access is not available in this browser.');
      return;
    }

    setBusy(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolveDeliveryLocation(
          position.coords.latitude,
          position.coords.longitude,
        )
          .then(onResolved)
          .catch((value) =>
            setError(
              value instanceof Error
                ? value.message
                : 'Could not check delivery availability.',
            ),
          )
          .finally(() => setBusy(false));
      },
      () => {
        setBusy(false);
        setError(
          'Location permission was not granted. You can still browse, but live store stock needs a delivery location.',
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };

  return (
    <>
      <button
        className="drawer-backdrop"
        onClick={onClose}
        aria-label="Close location selector"
      />
      <section
        className="location-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-dialog-title"
      >
        <button
          className="location-close"
          onClick={onClose}
          aria-label="Close"
        >
          <X />
        </button>
        <div className="location-icon">
          <MapPin />
        </div>
        <p className="eyebrow">DELIVERY LOCATION</p>
        <h2 id="location-dialog-title">What should Pasalho show you?</h2>
        <p>
          Your location chooses the right Pasalho store, live stock, prices,
          delivery fee and realistic ETA.
        </p>
        <button className="location-primary" onClick={locate} disabled={busy}>
          {busy ? (
            <LoaderCircle className="spin" />
          ) : (
            <LocateFixed />
          )}
          {busy ? 'Checking your area…' : 'Use my current location'}
        </button>
        {error ? <p className="location-error" role="alert">{error}</p> : null}
        <small>
          Pasalho uses the coordinates only to resolve serviceability and your
          fulfillment store.
        </small>
      </section>
    </>
  );
}

export function MobileCartBar() {
  const { items, setDrawer } = useShop();
  const count = items.reduce((total, item) => total + item.qty, 0);
  const subtotal = items.reduce(
    (total, item) => total + item.product.price * item.qty,
    0,
  );

  if (!count) return null;

  return (
    <button
      className="mobile-cart-bar"
      onClick={() => setDrawer(true)}
      aria-label={`Open cart with ${count} items, subtotal ${formatPrice(subtotal)}`}
    >
      <span className="mobile-cart-count">{count}</span>
      <span className="mobile-cart-copy">
        <b>View cart</b>
        <small>{formatPrice(subtotal)} item subtotal</small>
      </span>
      <span className="mobile-cart-arrow">›</span>
    </button>
  );
}

export function MobileNav() {
  const { items, setDrawer } = useShop();
  const count = items.reduce((total, item) => total + item.qty, 0);
  return (
    <nav className="mobile-nav">
      <Link href="/">
        <span className="mobile-symbol">⌂</span>
        <span>Home</span>
      </Link>
      <Link href="/shop">
        <Menu />
        <span>Categories</span>
      </Link>
      <button
        onClick={() =>
          document.querySelector<HTMLInputElement>('.search-box input')?.focus()
        }
      >
        <Search />
        <span>Search</span>
      </button>
      <Link href="/account/orders">
        <span className="mobile-symbol">↻</span>
        <span>Orders</span>
      </Link>
      <button onClick={() => setDrawer(true)}>
        <ShoppingCart />
        <span>{count ? `Cart · ${count}` : 'Cart'}</span>
      </button>
    </nav>
  );
}

export function LocationPicker({
  prominent = false,
}: {
  prominent?: boolean;
}) {
  const { selectedStore, delivery, requestLocation } = useShop();

  return (
    <button
      className={`location-picker pasalho-location-picker ${prominent ? 'prominent' : ''}`}
      onClick={requestLocation}
    >
      <MapPin />
      <span>
        <small>
          {delivery ? 'Delivery from' : 'Set delivery location'}
        </small>
        <b>{selectedStore?.name || 'Choose your area'}</b>
        {delivery ? (
          <em>
            {delivery.etaMinMinutes}–{delivery.etaMaxMinutes} min estimate
          </em>
        ) : null}
      </span>
      <ChevronDown />
    </button>
  );
}
