'use client';
import { useMemo, useState } from 'react';
import { ChevronDown, Filter, X } from 'lucide-react';
import { Product } from '@/lib/catalog';
import { ProductCard, useShop } from './CommerceClient';

export function CatalogGrid({ initial }: { initial?: Product[] }) {
  const { products } = useShop();
  const source = initial || products;
  const [filter, setFilter] = useState(false); const [brand, setBrand] = useState<string[]>([]); const [sort, setSort] = useState('featured');
  const shown = useMemo(() => { const filtered = brand.length ? source.filter((p) => brand.includes(p.brand)) : source; return [...filtered].sort((a, b) => sort === 'low' ? a.price - b.price : sort === 'high' ? b.price - a.price : b.rating - a.rating); }, [source, brand, sort]);
  const brands = [...new Set(source.map((p) => p.brand))].slice(0, 12);
  return <div className="catalog"><button className="filter-mobile" onClick={() => setFilter(true)}><Filter /> Filters</button><aside className={`filters ${filter ? 'open' : ''}`}><header><h2>Filters</h2><button onClick={() => setFilter(false)} aria-label="Close filters"><X /></button></header><FilterGroup title="Availability"><label><input type="checkbox" /> In stock</label><label><input type="checkbox" /> Pickup today</label></FilterGroup><FilterGroup title="Brand">{brands.map((x) => <label key={x}><input type="checkbox" checked={brand.includes(x)} onChange={() => setBrand((v) => v.includes(x) ? v.filter((b) => b !== x) : [...v, x])} /> {x}</label>)}</FilterGroup></aside><div className="catalog-results"><div className="catalog-toolbar"><span><b>{shown.length}</b> products</span><label>Sort by <select value={sort} onChange={(e) => setSort(e.target.value)}><option value="featured">Featured</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option></select><ChevronDown /></label></div>{shown.length ? <div className="catalog-grid">{shown.map((p) => <ProductCard key={p.id} product={p} />)}</div> : <p className="empty-page">No products found for this selection.</p>}</div></div>;
}
function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) { return <details open><summary>{title}<ChevronDown /></summary><div>{children}</div></details>; }
