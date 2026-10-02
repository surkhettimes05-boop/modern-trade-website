'use client';

import type { Product } from '@/lib/catalog';
import { ProductCard } from '@/components/CommerceClient';

export default function HomeProductRail({ products, compact = false }: { products: Product[]; compact?: boolean }) {
  return <div className={`fresh-product-rail ${compact ? "compact-rail" : ""}`}>{products.map((product) => <ProductCard product={product} compact={compact} key={product.id} />)}</div>;
}
