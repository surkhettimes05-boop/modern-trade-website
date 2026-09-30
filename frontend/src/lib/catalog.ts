export type Product = {
  id: string;
  slug: string;
  sku?: string;
  name: string;
  brand: string;
  category: string;
  categoryId?: string;
  description: string;
  image: string;
  price: number;
  originalPrice?: number;
  rating: number;
  reviews: number;
  availability: string;
  tags: string[];
  unit?: string;
  specifications: Record<string, string>;
  defaultUnitId?: string;
  maxOrderQuantity?: number;
  source?: 'pasalho' | 'legacy' | 'preview';
};

export type StorefrontCategory = { id: string; name: string; slug: string; image?: string; description?: string; skuCount?: number; priority?: 'Core' | 'Standard' | 'Test' };
export type Store = { id: string; name: string; address?: string; phone?: string; hours?: string; services?: string[] | Record<string, unknown>; latitude?: number; longitude?: number; map_url?: string; is_temporarily_closed?: boolean; source?: 'pasalho' | 'legacy'; serviceZoneId?: string };
export type Offer = { id: string; title: string; description: string; image_url?: string; banner_image_url?: string; start_date: string; end_date: string; terms?: string; is_featured: boolean; sort_order: number };

export { MARKET, formatPrice } from './market';
export const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const image = (id: string) => id.startsWith('/') ? id : `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=82`;

// Browsing-only category hints shown before serviceability resolves.
// They intentionally contain no fake stock, price, SKU-count, or brand claims.
export const openingCategories: StorefrontCategory[] = [
  'Rice & grains',
  'Dal & pulses',
  'Flour & staples',
  'Cooking oil & ghee',
  'Salt, sugar & spices',
  'Instant noodles',
  'Biscuits & snacks',
  'Beverages',
  'Milk & dairy',
  'Personal care',
  'Baby care',
  'Laundry & cleaning',
].map((name, index) => ({
  id: `opening-${index + 1}`,
  name,
  slug: slugify(name),
  description: 'Live products appear after Pasalho confirms your fulfillment store.',
}));

// Customer commerce must never fall back to fabricated product availability.
export const openingProducts: Product[] = [];

export function mapProduct(row: Record<string, unknown>): Product {
  const name = String(row.name || 'Product');
  const image = String(row.image_url || (Array.isArray(row.images) ? row.images[0] : '') || '/placeholder-product.svg');
  return { id: String(row.id), slug: slugify(name), sku: row.sku ? String(row.sku) : undefined, name, brand: String(row.brand || 'Pasalho'), category: String(row.category_name || 'Everyday essentials'), categoryId: row.category_id ? String(row.category_id) : undefined, description: String(row.description || ''), image, price: Number(row.price || 0), originalPrice: row.original_price ? Number(row.original_price) : undefined, rating: Number(row.rating || 0), reviews: Number(row.review_count || 0), availability: String(row.availability_status || 'OUT_OF_STOCK').replaceAll('_', ' '), tags: row.is_featured ? ['Featured'] : [], unit: row.unit ? String(row.unit) : undefined, specifications: { SKU: String(row.sku || '—'), Pack: String(row.pack_size || '—'), Department: String(row.category_name || 'Everyday essentials') } };
}


export function mapPasalhoCategory(row: Record<string, unknown>): StorefrontCategory {
  return {
    id: String(row.id),
    name: String(row.name || 'Category'),
    slug: String(row.slug || slugify(String(row.name || 'category'))),
    image: row.imageUrl ? String(row.imageUrl) : undefined,
  };
}

export function mapPasalhoProduct(row: Record<string, unknown>): Product {
  const category =
    row.category && typeof row.category === 'object'
      ? (row.category as Record<string, unknown>)
      : {};
  const brand =
    row.brand && typeof row.brand === 'object'
      ? (row.brand as Record<string, unknown>)
      : {};
  const price =
    row.price && typeof row.price === 'object'
      ? (row.price as Record<string, unknown>)
      : {};
  const availability =
    row.availability && typeof row.availability === 'object'
      ? (row.availability as Record<string, unknown>)
      : {};

  const sellingPrice = Number(price.sellingPrice ?? 0);
  const mrp = Number(price.mrp ?? sellingPrice);
  const state = String(availability.state || 'OUT_OF_STOCK');

  return {
    id: String(row.id),
    slug: String(row.slug || row.skuCode || slugify(String(row.name || 'product'))),
    sku: row.skuCode ? String(row.skuCode) : undefined,
    name: String(row.name || 'Product'),
    brand: String(brand.name || ''),
    category: String(category.name || 'Everyday essentials'),
    categoryId: category.id ? String(category.id) : undefined,
    description: String(row.shortDescription || row.description || ''),
    image: String(row.imageUrl || '/placeholder-product.svg'),
    price: sellingPrice,
    originalPrice: mrp > sellingPrice ? mrp : undefined,
    rating: 0,
    reviews: 0,
    availability: state.replaceAll('_', ' '),
    tags: [],
    unit: row.packLabel ? String(row.packLabel) : undefined,
    specifications: {
      SKU: String(row.skuCode || '—'),
      Pack: String(row.packLabel || '—'),
      Department: String(category.name || 'Everyday essentials'),
    },
    defaultUnitId: row.defaultUnitId ? String(row.defaultUnitId) : undefined,
    maxOrderQuantity:
      availability.maxOrderQuantity == null
        ? undefined
        : Number(availability.maxOrderQuantity),
    source: 'pasalho',
  };
}
