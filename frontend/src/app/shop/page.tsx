'use client';
import Link from 'next/link';
import { CatalogGrid } from '@/components/CatalogClient';
import { useShop } from '@/components/CommerceClient';
export default function Shop() { const { categories, loading } = useShop(); return <div className="shell page"><nav className="breadcrumbs"><Link href="/">Home</Link><span>›</span>Shop</nav><div className="page-head"><div><p className="eyebrow">NOVA MART ONLINE</p><h1>Shop all products</h1><p>Everyday essentials, trusted brands and prices made for real life.</p></div></div><div className="chips">{categories.map((category) => <Link href={`/category/${category.slug}`} key={category.id}>{category.name}</Link>)}</div>{loading ? <p className="py-12 text-center">Loading products…</p> : <CatalogGrid />}</div>; }
