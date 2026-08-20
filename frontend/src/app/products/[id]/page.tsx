import { notFound, permanentRedirect } from 'next/navigation';
import { openingProducts } from '@/lib/catalog';
import { getCatalog } from '@/lib/serverCatalog';
export default async function LegacyProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const openingProduct = openingProducts.find((item) => item.id === id);
  if (openingProduct) permanentRedirect(`/product/${openingProduct.slug}`);
  const { products } = await getCatalog();
  const product = products.find((item) => item.id === id);
  if (!product) notFound();
  permanentRedirect(`/product/${product.slug}`);
}
