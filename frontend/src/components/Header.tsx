"use client";
import Link from "next/link";
import { ChevronDown, MapPin, ShoppingBag, UserRound } from "lucide-react";
import { useState } from "react";
import { CartButton, MegaMenu, SearchBox } from "./CommerceClient";
export default function Header() {
  const [categories, setCategories] = useState(false);
  return <header className="site-header"><div className="shell header-row">
    <Link href="/" className="fresh-logo" aria-label="Pasalho home"><ShoppingBag size={28} /><span>pasalho<span className="logo-dot">.</span></span></Link>
    <Link href="/checkout" className="delivery-link"><MapPin size={20} /><span><strong>Deliver to your doorstep</strong><small>Choose address at checkout <ChevronDown size={12} /></small></span></Link>
    <SearchBox /><div className="header-actions"><Link className="nav-action" href="/account" aria-label="Account"><UserRound size={20} /><span>Account</span></Link><CartButton /></div></div>
    <nav className="shop-tabs shell" aria-label="Shop navigation"><button onClick={() => setCategories(!categories)} aria-expanded={categories}>All categories <ChevronDown size={14} /></button><Link href="/shop">Shop all</Link><Link href="/category/rice">Daily essentials</Link><Link href="/category/chips-snacks">Snacks & drinks</Link><Link href="/category/personal-hygiene">Personal care</Link><Link href="/offers">Offers</Link><Link href="/account/orders">My orders</Link></nav>
    {categories && <div className="mega-wrap"><MegaMenu open onClose={() => setCategories(false)} /></div>}
  </header>;
}
