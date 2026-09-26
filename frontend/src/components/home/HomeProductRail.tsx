'use client';

import type { Product } from '@/lib/catalog';
import { ProductCard } from '@/components/CommerceClient';
import styles from '@/app/homepage.module.css';

export default function HomeProductRail({ products, compact = false }: { products: Product[]; compact?: boolean }) {
  return <div className={`${styles.productRail} ${compact ? styles.compactRail : ''}`}>{products.map((product) => <ProductCard product={product} compact={compact} key={product.id} />)}</div>;
}
