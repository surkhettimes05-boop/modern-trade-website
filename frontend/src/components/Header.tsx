"use client";
import Link from "next/link";
import Image from "next/image";
import { Heart, MapPin, Menu, UserRound, X } from "lucide-react";
import { useState } from "react";
import { CartButton, MegaMenu, SearchBox, useShop } from "./CommerceClient";

export default function Header() {
  const [mega, setMega] = useState(false);
  const [mobile, setMobile] = useState(false);
  const { selectedStore } = useShop();

  return (
    <>
      <div className="utility">
        <div className="shell">
          <span>
            <MapPin size={14} strokeWidth={2} /> Delivering to <b>{selectedStore?.name || "Choose a store"}</b>
          </span>
          <nav>
            <Link href="/stores">Find a store</Link>
            <Link href="/faq">Help</Link>
            <Link href="/about">Careers</Link>
            <Link href="/about">Business / Wholesale</Link>
            <Link href="/account">Sign in</Link>
          </nav>
        </div>
      </div>

      <header className="site-header">
        <div className="shell header-row">
          <Link href="/" className="logo" aria-label="Pasalho home">
            <Image src="/assets/logo/pasalho-logo.svg" alt="Pasalho" width={220} height={80} priority />
          </Link>

          <button className="category-trigger" onClick={() => setMega(!mega)} aria-expanded={mega} aria-label="Open categories">
            <Menu size={22} strokeWidth={2} />
            <span>Categories</span>
          </button>

          <nav className="main-links">
            <Link href="/shop">Shop</Link>
            <Link href="/offers">Offers</Link>
            <Link href="/stores">Stores</Link>
            <Link href="/about">About</Link>
          </nav>

          <SearchBox />

          <div className="header-actions">
            <Link className="nav-action" href="/account" aria-label="Account">
              <UserRound size={21} strokeWidth={2} />
              <span>Account</span>
            </Link>
            <Link className="nav-action" href="/account" aria-label="Wishlist">
              <Heart size={21} strokeWidth={2} />
              <span>Wishlist</span>
            </Link>
            <CartButton />
          </div>

          <Link className="header-app-cta" href="/#pasalho-app">Download app</Link>

          <button className="mobile-menu" onClick={() => setMobile(!mobile)} aria-label={mobile ? "Close menu" : "Open menu"} aria-expanded={mobile} aria-controls="mobile-site-navigation">
            {mobile ? <X size={22} strokeWidth={2} /> : <Menu size={22} strokeWidth={2} />}
          </button>
        </div>

        {mega ? <div className="mega-wrap"><MegaMenu open={mega} onClose={() => setMega(false)} /></div> : null}
        {mobile ? (
          <nav className="mobile-panel" id="mobile-site-navigation" aria-label="Mobile navigation">
            <Link href="/shop" onClick={() => setMobile(false)}>Shop</Link>
            <button onClick={() => { setMega(true); setMobile(false); }}>Categories</button>
            <Link href="/offers" onClick={() => setMobile(false)}>Offers</Link>
            <Link href="/stores" onClick={() => setMobile(false)}>Stores</Link>
            <Link href="/about" onClick={() => setMobile(false)}>About</Link>
            <Link href="/account" onClick={() => setMobile(false)}>Account</Link>
            <Link className="mobile-app-cta" href="/#pasalho-app" onClick={() => setMobile(false)}>Download app</Link>
          </nav>
        ) : null}
      </header>
    </>
  );
}
