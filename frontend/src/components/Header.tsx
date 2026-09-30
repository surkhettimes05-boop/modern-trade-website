"use client";

import Link from "next/link";
import { CircleUserRound, Menu, X } from "lucide-react";
import { useState } from "react";
import {
  CartButton,
  LocationPicker,
  SearchBox,
} from "./CommerceClient";

export default function Header() {
  const [mobile, setMobile] = useState(false);

  return (
    <header className="site-header pasalho-header">
      <div className="shell pasalho-header-row">
        <Link href="/" className="pasalho-logo" aria-label="Pasalho home">
          <span className="pasalho-logo-mark">P</span>
          <span className="pasalho-logo-word">pasalho</span>
        </Link>

        <div className="pasalho-header-location">
          <LocationPicker />
        </div>

        <SearchBox />

        <nav className="pasalho-main-links" aria-label="Primary navigation">
          <Link href="/shop">Categories</Link>
          <Link href="/offers">Offers</Link>
          <Link href="/account/orders">Orders</Link>
        </nav>

        <Link className="pasalho-account" href="/account">
          <CircleUserRound />
          <span>Account</span>
        </Link>

        <CartButton />

        <button
          className="mobile-menu"
          onClick={() => setMobile(!mobile)}
          aria-label="Menu"
          aria-expanded={mobile}
        >
          {mobile ? <X /> : <Menu />}
        </button>
      </div>

      {mobile ? (
        <nav className="mobile-panel">
          <Link href="/shop" onClick={() => setMobile(false)}>All categories</Link>
          <Link href="/offers" onClick={() => setMobile(false)}>Offers</Link>
          <Link href="/account/orders" onClick={() => setMobile(false)}>My orders</Link>
          <Link href="/account" onClick={() => setMobile(false)}>Account</Link>
        </nav>
      ) : null}
    </header>
  );
}
