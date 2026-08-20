import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CatalogGrid } from '@/components/CatalogClient';
import JsonLd from '@/components/JsonLd';
import { openingCategories } from '@/lib/catalog';
import { absoluteUrl, breadcrumbSchema, buildMetadata } from '@/lib/seo';
import { getCatalog, getCategoryBySlug } from '@/lib/serverCatalog';

type Props = { params: Promise<{ slug: string }> };
export const dynamicParams = true;
export function generateStaticParams() { return openingCategories.map(({ slug }) => ({ slug })); }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return buildMetadata({ title: 'Category not found', description: 'The requested category could not be found.', path: `/category/${slug}`, noIndex: true });
  return buildMetadata({ title: `${category.name} products`, description: `${category.description || `Shop ${category.name.toLowerCase()} products`} at NOVA MART Nepal with clear pricing and store-based availability.`, path: `/category/${category.slug}`, image: category.image });
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();
  const { products } = await getCatalog();
  const list = products.filter((product) => product.categoryId === category.id || product.category.toLowerCase() === category.name.toLowerCase());
  const url = absoluteUrl(`/category/${category.slug}`);
  const collectionSchema = {
    '@context': 'https://schema.org', '@type': 'CollectionPage', '@id': `${url}#collection`, name: `${category.name} products`, description: category.description, url,
    mainEntity: { '@type': 'ItemList', numberOfItems: list.length, itemListElement: list.map((product, index) => ({ '@type': 'ListItem', position: index + 1, url: absoluteUrl(`/product/${product.slug}`), name: product.name })) },
  };
  const crumbs = breadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Shop', path: '/shop' }, { name: category.name, path: `/category/${category.slug}` }]);
  return <div className="shell page">
    <JsonLd data={[collectionSchema, crumbs]} />
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span>›</span><Link href="/shop">Shop</Link><span>›</span><span aria-current="page">{category.name}</span></nav>
    <div className="page-head"><div><p className="eyebrow">SHOP THE RANGE</p><h1>{category.name}</h1><p>{category.description || 'Dependable quality and everyday value.'}</p></div></div>
    {list.length > 0 ? <CatalogGrid initial={list} /> : <section className="seo-copy"><h2>Products are being prepared</h2><p>This department is part of the NOVA MART opening range. Product availability will appear here as store inventory is confirmed.</p><Link className="primary-btn" href="/shop">Browse all products</Link></section>}
    <section className="seo-copy"><h2>Shopping for {category.name.toLowerCase()}</h2><p>{category.description}. NOVA MART organizes this department as a {category.priority?.toLowerCase() || 'planned'} part of its Nepal assortment, with prices and fulfilment shown against current store information.</p><p><Link href="/guides/safer-grocery-storage">Read our source-backed grocery handling guide</Link></p></section>
  </div>;
}
