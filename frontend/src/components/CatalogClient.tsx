'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Filter, Search, X } from 'lucide-react';
import { Product, searchProducts } from '@/lib/catalog';
import { ProductCard, useShop } from './CommerceClient';

export function CatalogGrid({ initial }: { initial?: Product[] }) {
  const { products } = useShop();
  const source = initial || products;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [availability, setAvailability] = useState('all');
  const [sort, setSort] = useState('featured');

  const categories = useMemo(
    () => [...new Set(source.map((product) => product.category).filter(Boolean))].sort(),
    [source],
  );

  const shown = useMemo(() => {
    let next = searchProducts(source, query);
    if (category !== 'all') next = next.filter((product) => product.category === category);
    if (availability === 'in') {
      next = next.filter((product) => !product.availability.toLowerCase().includes('out of'));
    } else if (availability === 'low') {
      next = next.filter((product) => product.availability.toLowerCase().includes('low stock'));
    } else if (availability === 'out') {
      next = next.filter((product) => product.availability.toLowerCase().includes('out of'));
    }
    const sorted = [...next];
    if (sort === 'low') sorted.sort((a, b) => a.price - b.price);
    else if (sort === 'high') sorted.sort((a, b) => b.price - a.price);
    else if (sort === 'new') {
      sorted.sort((a, b) => Date.parse(b.createdAt || '1970-01-01') - Date.parse(a.createdAt || '1970-01-01'));
    } else if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else {
      sorted.sort((a, b) =>
        Number(Boolean(b.featured)) - Number(Boolean(a.featured)) ||
        Number(Boolean(b.originalPrice)) - Number(Boolean(a.originalPrice)) ||
        a.name.localeCompare(b.name),
      );
    }
    return sorted;
  }, [availability, category, query, sort, source]);

  return (
    <div className="catalog">
      <button className="filter-mobile" onClick={() => setFiltersOpen(true)}>
        <Filter /> Filters
      </button>
      <aside className={`filters ${filtersOpen ? 'open' : ''}`}>
        <header>
          <h2>Filters</h2>
          <button onClick={() => setFiltersOpen(false)} aria-label="Close filters"><X /></button>
        </header>
        <FilterGroup title="Search">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, SKU or category"
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"
            />
          </label>
        </FilterGroup>
        <FilterGroup title="Availability">
          {[
            ['all', 'All products'],
            ['in', 'In stock'],
            ['low', 'Low stock'],
            ['out', 'Out of stock'],
          ].map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name="availability"
                checked={availability === value}
                onChange={() => setAvailability(value)}
              /> {label}
            </label>
          ))}
        </FilterGroup>
        <FilterGroup title="Category">
          <label>
            <input type="radio" name="category" checked={category === 'all'} onChange={() => setCategory('all')} /> All categories
          </label>
          {categories.map((name) => (
            <label key={name}>
              <input type="radio" name="category" checked={category === name} onChange={() => setCategory(name)} /> {name}
            </label>
          ))}
        </FilterGroup>
      </aside>
      <div className="catalog-results">
        <div className="catalog-toolbar">
          <span><b>{shown.length}</b> products</span>
          <label>
            Sort by
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="featured">Best match</option>
              <option value="new">New arrivals</option>
              <option value="low">Price: low to high</option>
              <option value="high">Price: high to low</option>
              <option value="name">Name</option>
            </select>
            <ChevronDown />
          </label>
        </div>
        {shown.length ? (
          <div className="catalog-grid">
            {shown.map((product) => <ProductCard key={product.id} product={product} />)}
          </div>
        ) : (
          <p className="empty-page">No products match these filters.</p>
        )}
      </div>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <details open><summary>{title}<ChevronDown /></summary><div>{children}</div></details>;
}
