'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Filter, X } from 'lucide-react';
import { Product } from '@/lib/catalog';
import { ProductCard, useShop } from './CommerceClient';

export function CatalogGrid({ initial }: { initial?: Product[] }) {
  const { products } = useShop();
  const source = initial || products;
  const [filterOpen, setFilterOpen] = useState(false);
  const [brands, setBrands] = useState<string[]>([]);
  const [availableOnly, setAvailableOnly] = useState(true);
  const [sort, setSort] = useState<'recommended' | 'low' | 'high'>('recommended');

  const shown = useMemo(() => {
    let filtered = source.filter((product) => {
      if (
        availableOnly &&
        product.availability.toLowerCase().includes('out')
      ) {
        return false;
      }
      if (brands.length && !brands.includes(product.brand)) return false;
      return true;
    });

    if (sort === 'low') {
      filtered = [...filtered].sort((a, b) => a.price - b.price);
    } else if (sort === 'high') {
      filtered = [...filtered].sort((a, b) => b.price - a.price);
    }

    return filtered;
  }, [availableOnly, brands, sort, source]);

  const brandOptions = [
    ...new Set(source.map((product) => product.brand).filter(Boolean)),
  ].slice(0, 16);

  return (
    <div className="catalog">
      <button
        className="filter-mobile"
        onClick={() => setFilterOpen(true)}
      >
        <Filter /> Filters
      </button>

      <aside className={`filters ${filterOpen ? 'open' : ''}`}>
        <header>
          <h2>Filters</h2>
          <button
            onClick={() => setFilterOpen(false)}
            aria-label="Close filters"
          >
            <X />
          </button>
        </header>

        <FilterGroup title="Availability">
          <label>
            <input
              type="checkbox"
              checked={availableOnly}
              onChange={(event) => setAvailableOnly(event.target.checked)}
            />
            Available now
          </label>
        </FilterGroup>

        {brandOptions.length ? (
          <FilterGroup title="Brand">
            {brandOptions.map((brand) => (
              <label key={brand}>
                <input
                  type="checkbox"
                  checked={brands.includes(brand)}
                  onChange={() =>
                    setBrands((current) =>
                      current.includes(brand)
                        ? current.filter((value) => value !== brand)
                        : [...current, brand],
                    )
                  }
                />
                {brand}
              </label>
            ))}
          </FilterGroup>
        ) : null}
      </aside>

      <div className="catalog-results">
        <div className="catalog-toolbar">
          <span>
            <b>{shown.length}</b> products
          </span>
          <label>
            Sort by
            <select
              value={sort}
              onChange={(event) =>
                setSort(event.target.value as 'recommended' | 'low' | 'high')
              }
            >
              <option value="recommended">Recommended</option>
              <option value="low">Price: low to high</option>
              <option value="high">Price: high to low</option>
            </select>
            <ChevronDown />
          </label>
        </div>

        {shown.length ? (
          <div className="catalog-grid">
            {shown.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="empty-page">
            <h2>No matching products</h2>
            <p>Try removing a brand filter or showing unavailable products.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details open>
      <summary>
        {title}
        <ChevronDown />
      </summary>
      <div>{children}</div>
    </details>
  );
}
