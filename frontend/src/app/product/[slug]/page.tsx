import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import JsonLd from '@/components/JsonLd';
import { ProductCard } from '@/components/CommerceClient';
import { BuyBox, ProductGallery } from '@/components/ProductDetailClient';
import { formatPrice, openingProducts } from '@/lib/catalog';
import { absoluteUrl, breadcrumbSchema, buildMetadata, SITE } from '@/lib/seo';
import { getCatalog, getProductBySlug } from '@/lib/serverCatalog';

type Props = { params: Promise<{ slug: string }> };
export const dynamicParams = true;
export function generateStaticParams() { return openingProducts.map(({ slug }) => ({ slug })); }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return buildMetadata({ title: 'Product not found', description: 'The requested product could not be found.', path: `/product/${slug}`, noIndex: true });
  return buildMetadata({ title: product.name, description: product.description || `Shop ${product.name} from ${product.brand} at NOVA MART Nepal.`, path: `/product/${product.slug}`, image: product.image });
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();
  const { products, categories } = await getCatalog();
  const category = categories.find((item) => item.id === product.categoryId || item.name.toLowerCase() === product.category.toLowerCase());
  const related = products.filter((item) => item.id !== product.id && (item.categoryId === product.categoryId || item.category === product.category)).slice(0, 5);
  const productSchema = {
    '@context': 'https://schema.org', '@type': 'Product', '@id': `${absoluteUrl(`/product/${product.slug}`)}#product`,
    name: product.name, description: product.description, image: [absoluteUrl(product.image)], sku: product.sku,
    brand: { '@type': 'Brand', name: product.brand }, category: product.category,
    offers: { '@type': 'Offer', url: absoluteUrl(`/product/${product.slug}`), priceCurrency: SITE.currency, price: product.price, availability: product.availability.toLowerCase().includes('out') ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock', itemCondition: 'https://schema.org/NewCondition' },
  };
  const crumbs = breadcrumbSchema([
    { name: 'Home', path: '/' }, { name: 'Shop', path: '/shop' },
    ...(category ? [{ name: category.name, path: `/category/${category.slug}` }] : []),
    { name: product.name, path: `/product/${product.slug}` },
  ]);
  return <div className="shell page">
    <JsonLd data={[productSchema, crumbs]} />
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span>›</span><Link href="/shop">Shop</Link>{category && <><span>›</span><Link href={`/category/${category.slug}`}>{category.name}</Link></>}<span>›</span><span aria-current="page">{product.name}</span></nav>
    <div className="pdp"><ProductGallery product={product} /><BuyBox product={product} /></div>
    <div className="pdp-info"><section><h2>Product details</h2><p>{product.description}</p><p>{product.name} is part of NOVA MART&apos;s {product.category.toLowerCase()} range for shoppers in Nepal.</p></section><section><h2>Specifications</h2>{Object.entries(product.specifications).map(([key, value]) => <p key={key}><span>{key}</span><b>{value}</b></p>)}</section><section><h2>Price and fulfilment</h2><p>{formatPrice(product.price)}. Store availability and fulfilment options are based on your selected store.</p><p><Link href="/guides/safer-grocery-storage">Safer grocery handling guide</Link></p></section></div>
    {related.length > 0 && <section className="section"><div className="section-title"><h2>More from {product.category}</h2>{category && <Link href={`/category/${category.slug}`}>View category</Link>}</div><div className="product-scroll">{related.map((item) => <ProductCard product={item} key={item.id} />)}</div></section>}
  </div>;
}
