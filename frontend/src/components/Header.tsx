"use client";

import Link from "next/link";
import { Check, ChevronDown, Heart, MapPin, Menu, Search, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CartButton, MegaMenu, SearchBox, useShop } from "./CommerceClient";

export default function Header({ browseOnly = false, webCheckoutEnabled = false }: { browseOnly?: boolean; webCheckoutEnabled?: boolean }) {
  const [mega, setMega] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationQuery, setLocationQuery] = useState("");
  const { selectedStore, stores, setSelectedStore } = useShop();
  const filteredStores = useMemo(() => {
    const query = locationQuery.trim().toLowerCase();
    return stores.filter((store) => !query || `${store.name} ${store.address || ""}`.toLowerCase().includes(query));
  }, [locationQuery, stores]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!localStorage.getItem("pasalho-store") && !localStorage.getItem("pasalho-location-dismissed")) {
        timer = setTimeout(() => setLocationOpen(true), 0);
      }
    } catch { /* storage may be unavailable */ }
    return () => { if (timer) clearTimeout(timer); };
  }, []);

  const dismissLocation = () => {
    try { localStorage.setItem("pasalho-location-dismissed", "1"); } catch { /* storage may be unavailable */ }
    setLocationOpen(false);
  };

  const chooseStore = (store: (typeof stores)[number]) => {
    setSelectedStore(store);
    try { localStorage.removeItem("pasalho-location-dismissed"); } catch { /* storage may be unavailable */ }
    setLocationOpen(false);
  };

  return <>
    <div className="utility"><div className="shell">
      <button className="delivery-location" type="button" onClick={() => setLocationOpen(true)} aria-haspopup="dialog" aria-expanded={locationOpen}>
        <MapPin size={17} />
        <span><small>{browseOnly ? "PASALHO · BIRENDRANAGAR" : "LOCAL DELIVERY"}</small><b>{selectedStore?.name || "Choose your store"}</b></span>
        <ChevronDown size={15} />
      </button>
      <nav><Link href="/stores">Find a store</Link><Link href="/faq">Help</Link><Link href="/about">Careers</Link><Link href="/about">Business / Wholesale</Link>{(!browseOnly || webCheckoutEnabled) && <Link href="/account">Sign in</Link>}</nav>
    </div></div>
    <header className="site-header"><div className="shell header-row">
      <Link href="/" className="logo" aria-label="Pasalho home"><i>P</i><span>PASALHO</span></Link>
      <button className="category-trigger" onClick={() => setMega(!mega)} aria-expanded={mega}><Menu size={19} /> Categories</button>
      <SearchBox />
      <nav className="main-links"><Link href="/offers">Offers</Link><Link href="/shop?sort=new">New Arrivals</Link>{!browseOnly && <Link href="/membership">Membership</Link>}<Link href="/stores">Stores</Link></nav>
      {browseOnly ? <div className="header-actions"><CartButton /></div> : <div className="header-actions"><Link className="nav-action" href="/account"><UserRound /><span>Account</span></Link><Link className="nav-action" href="/account"><Heart /><span>Wishlist</span></Link><CartButton /></div>}
      <button className="mobile-menu" onClick={() => setMobile(!mobile)} aria-label="Menu">{mobile ? <X /> : <Menu />}</button>
    </div>
      {mega && <div className="mega-wrap"><MegaMenu open={mega} onClose={() => setMega(false)} /></div>}
      {mobile && <nav className="mobile-panel"><Link href="/shop">Browse all products</Link><Link href="/offers">Today’s offers</Link>{!browseOnly && <Link href="/membership">Membership</Link>}<Link href="/stores">Find a store</Link>{(!browseOnly || webCheckoutEnabled) && <Link href="/account">My account</Link>}</nav>}
    </header>
    {locationOpen && <div className="store-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) dismissLocation(); }}>
      <section className="store-dialog" role="dialog" aria-modal="true" aria-labelledby="store-dialog-title">
        <button className="store-dialog-close" type="button" onClick={dismissLocation} aria-label="Close store selector"><X size={20} /></button>
        <p className="store-dialog-welcome">Welcome to <b>PASALHO</b></p>
        <div className="store-dialog-title-row"><MapPin size={30} /><div><h2 id="store-dialog-title">Choose your delivery store</h2><p>See products and availability from a nearby PASALHO store.</p></div></div>
        <label className="store-dialog-search"><Search size={19} /><input value={locationQuery} onChange={(event) => setLocationQuery(event.target.value)} placeholder="Search Birendranagar or store name" autoFocus /></label>
        <div className="store-dialog-list" aria-live="polite">
          {filteredStores.map((store) => <button className="store-dialog-option" key={store.id} type="button" onClick={() => chooseStore(store)} disabled={store.is_temporarily_closed}>
            <span className="store-dialog-pin"><MapPin size={18} /></span><span><b>{store.name}</b><small>{store.address || "Birendranagar, Surkhet"}{store.is_temporarily_closed ? " · Temporarily closed" : ""}</small></span>{selectedStore?.id === store.id ? <Check className="store-dialog-check" size={18} /> : <ChevronDown size={16} />}
          </button>)}
          {!stores.length && <p className="store-dialog-empty">Loading nearby PASALHO stores…</p>}
          {stores.length > 0 && filteredStores.length === 0 && <p className="store-dialog-empty">No stores match that search. Try another name.</p>}
        </div>
        <button className="store-dialog-later" type="button" onClick={dismissLocation}>Browse without choosing a store</button>
      </section>
    </div>}
  </>;
}
