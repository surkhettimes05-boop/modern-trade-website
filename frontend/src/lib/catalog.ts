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
};

export type StorefrontCategory = { id: string; name: string; slug: string; image?: string; description?: string; skuCount?: number; priority?: 'Core' | 'Standard' | 'Test' };
export type Store = { id: string; name: string; address?: string; phone?: string; hours?: string; services?: string[] | Record<string, unknown>; latitude?: number; longitude?: number; map_url?: string; is_temporarily_closed?: boolean };
export type Offer = { id: string; title: string; description: string; image_url?: string; banner_image_url?: string; start_date: string; end_date: string; terms?: string; is_featured: boolean; sort_order: number };

export { MARKET, formatPrice } from './market';
export const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const image = (id: string) => id.startsWith('/') ? id : `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=82`;

// StoreSync Opening SKU Plan v2: 642 launch SKUs across 29 practical departments.
export const openingCategories: StorefrontCategory[] = [
  ['Rice', 25, 'Core', 'Local rice, basmati, jeera masino, sona mansuli'],
  ['Dal & pulses', 30, 'Core', 'Masoor, moong, rahar, chana, black dal, rajma'],
  ['Flour & grains', 20, 'Core', 'Atta, maida, suji, chiura, corn flour'],
  ['Cooking oil & ghee', 25, 'Core', 'Soybean, sunflower, mustard oil, ghee'],
  ['Salt, sugar & spices', 40, 'Core', 'Salt, sugar, turmeric, chilli, cumin, coriander, masala'],
  ['Instant noodles', 25, 'Core', 'Top Nepal brands; singles and multipacks'],
  ['Biscuits & cookies', 45, 'Core', 'Glucose, cream, digestive, crackers, cookies'],
  ['Chips & snacks', 35, 'Core', 'Chips, bhujiya, dalmoth, popcorn, namkeen'],
  ['Chocolate & confectionery', 30, 'Standard', 'Chocolate, candy, gum, lollipops'],
  ['Soft drinks', 25, 'Standard', 'Trimmed to match opening cold-chain capacity'],
  ['Water', 8, 'Core', 'Two to three bottle sizes at launch'],
  ['Juice & other drinks', 15, 'Standard', 'Juice and everyday refreshments'],
  ['Tea & coffee', 20, 'Core', 'Tea leaves, tea bags, instant coffee'],
  ['Milk & dairy', 25, 'Core', 'Milk, curd, paneer, butter, cheese'],
  ['Breakfast', 15, 'Standard', 'Oats, cereals, cornflakes, spreads'],
  ['Sauces & condiments', 20, 'Standard', 'Ketchup, chilli sauce, soy sauce, vinegar, pickles'],
  ['Canned & packaged foods', 12, 'Standard', 'Beans, corn, mushrooms, ready foods'],
  ['Personal hygiene', 35, 'Core', 'Top brands per sub-category'],
  ['Hair care', 25, 'Core', 'Shampoo, conditioner, hair oil'],
  ['Oral care', 20, 'Core', 'Toothpaste, toothbrush, mouthwash'],
  ['Feminine hygiene', 20, 'Core', 'Pads across core sizes and types'],
  ['Baby care', 15, 'Standard', 'Diapers: top brands and core sizes'],
  ['Laundry', 25, 'Core', 'Detergent powder, bars, liquid, fabric products'],
  ['Dishwashing', 15, 'Core', 'Bars, liquids, scrubbers'],
  ['Household cleaning', 20, 'Core', 'Floor, toilet and glass cleaners'],
  ['Tissue & paper', 12, 'Standard', 'Toilet rolls, facial tissue, kitchen towels'],
  ['Household consumables', 15, 'Standard', 'Garbage bags, foil, cling film, matches'],
  ['Batteries & basic utility', 10, 'Standard', 'AA/AAA batteries, bulbs and small essentials'],
  ['Seasonal & miscellaneous', 15, 'Test', 'Mosquito products and seasonal necessities'],
].map(([name, skuCount, priority, description], index) => ({
  id: `opening-${index + 1}`,
  name: String(name),
  slug: slugify(String(name)),
  skuCount: Number(skuCount),
  priority: priority as StorefrontCategory['priority'],
  description: String(description),
  image: image([
    'photo-1542838132-92c53300491e', 'photo-1606787366850-de6330128bfc', 'photo-1586201375761-83865001e31c',
    'photo-1474979266404-7eaacbcd87c5', 'photo-1596040033229-a9821ebd058d', 'photo-1569718212165-3a8278d5f624',
    'photo-1558961363-fa8fdf82db35', '/category-chips-snacks.png', '/category-chocolate-confectionery.png',
    'photo-1544145945-f90425340c7e', 'photo-1548839140-29a749e1cf4d', 'photo-1600271886742-f049cd451bba',
    'photo-1495474472287-4d71bcdd2085', 'photo-1550583724-b2692b85b150', 'photo-1490474418585-ba9bad8fd0ea',
    '/category-sauces-condiments.png', 'photo-1585937421612-70a008356fbe', 'photo-1556228578-8c89e6adf883',
    'photo-1522335789203-aabd1fc54bc9', '/category-oral-care.png', 'photo-1556228720-195a672e8a03',
    'photo-1620916566398-39f1143ab7be', 'photo-1582735689369-4fe89db7114c', 'photo-1583947215259-38e31be8751f',
    'photo-1584820927498-cfe5211fd8bf', 'photo-1581578731548-c64695cc6952', 'photo-1586864387967-d02ef85d93e8',
    'photo-1512820790803-83ca734da794', '/category-seasonal-miscellaneous.png',
  ][index]),
}));

export const openingProducts: Product[] = [
  { id: 'opening-rice-5kg', slug: 'premium-basmati-rice-5kg', sku: 'RICE-5KG', name: 'Premium Basmati Rice 5kg', brand: 'StoreSync Select', category: 'Rice', categoryId: 'opening-1', description: 'Long-grain premium rice for everyday family meals.', image: image('photo-1586201375761-83865001e31c'), price: 799, originalPrice: 999, rating: 4.8, reviews: 42, availability: 'AVAILABLE', tags: ['Core', 'Opening range'], unit: '5 kg bag', specifications: { SKU: 'RICE-5KG', Pack: '5 kg', Department: 'Rice' } },
  { id: 'opening-oil-1l', slug: 'sunflower-oil-1l', sku: 'OIL-1L', name: 'Sunflower Oil 1L', brand: 'StoreSync Select', category: 'Cooking oil & ghee', categoryId: 'opening-4', description: 'Refined sunflower oil for daily cooking.', image: image('photo-1474979266404-7eaacbcd87c5'), price: 179, originalPrice: 219, rating: 4.7, reviews: 35, availability: 'AVAILABLE', tags: ['Core', 'Opening range'], unit: '1 L bottle', specifications: { SKU: 'OIL-1L', Pack: '1 L', Department: 'Cooking oil & ghee' } },
  { id: 'opening-water-1l', slug: 'mineral-water-1l', sku: 'WATER-1L', name: 'Mineral Water 1L', brand: 'StoreSync Select', category: 'Water', categoryId: 'opening-11', description: 'Purified mineral water for home and on-the-go.', image: image('photo-1548839140-29a749e1cf4d'), price: 25, originalPrice: 30, rating: 4.6, reviews: 28, availability: 'AVAILABLE', tags: ['Core', 'Opening range'], unit: '1 L bottle', specifications: { SKU: 'WATER-1L', Pack: '1 L', Department: 'Water' } },
  { id: 'opening-noodles', slug: 'instant-noodles-family-pack', sku: 'NOODLES-FAM', name: 'Instant Noodles Family Pack', brand: 'Wai Wai', category: 'Instant noodles', categoryId: 'opening-6', description: 'Fast, familiar pantry comfort for busy days.', image: image('photo-1569718212165-3a8278d5f624'), price: 120, rating: 4.7, reviews: 31, availability: 'AVAILABLE', tags: ['Core', 'Opening range'], unit: '5 x 70 g', specifications: { SKU: 'NOODLES-FAM', Pack: '5 pack', Department: 'Instant noodles' } },
  { id: 'opening-detergent', slug: 'everyday-laundry-detergent', sku: 'LAUNDRY-1KG', name: 'Everyday Laundry Detergent 1kg', brand: 'StoreSync Select', category: 'Laundry', categoryId: 'opening-23', description: 'Reliable cleaning power for everyday laundry.', image: image('photo-1582735689369-4fe89db7114c'), price: 245, rating: 4.5, reviews: 24, availability: 'AVAILABLE', tags: ['Core', 'Opening range'], unit: '1 kg pack', specifications: { SKU: 'LAUNDRY-1KG', Pack: '1 kg', Department: 'Laundry' } },
  { id: 'opening-shampoo', slug: 'daily-care-shampoo-340ml', sku: 'SHAMPOO-340', name: 'Daily Care Shampoo 340ml', brand: 'StoreSync Select', category: 'Hair care', categoryId: 'opening-19', description: 'Gentle everyday shampoo for the whole household.', image: image('photo-1556228720-195a672e8a03'), price: 299, rating: 4.4, reviews: 19, availability: 'AVAILABLE', tags: ['Core', 'Opening range'], unit: '340 ml bottle', specifications: { SKU: 'SHAMPOO-340', Pack: '340 ml', Department: 'Hair care' } },
];
export function mapProduct(row: Record<string, unknown>): Product {
  const name = String(row.name || 'Product');
  const image = String(row.image_url || (Array.isArray(row.images) ? row.images[0] : '') || '/placeholder-product.svg');
  return { id: String(row.id), slug: slugify(name), sku: row.sku ? String(row.sku) : undefined, name, brand: String(row.brand || 'NOVA MART'), category: String(row.category_name || 'Everyday essentials'), categoryId: row.category_id ? String(row.category_id) : undefined, description: String(row.description || ''), image, price: Number(row.price || 0), originalPrice: row.original_price ? Number(row.original_price) : undefined, rating: Number(row.rating || 0), reviews: Number(row.review_count || 0), availability: String(row.availability_status || 'OUT_OF_STOCK').replaceAll('_', ' '), tags: row.is_featured ? ['Featured'] : [], unit: row.unit ? String(row.unit) : undefined, specifications: { SKU: String(row.sku || '—'), Pack: String(row.pack_size || '—'), Department: String(row.category_name || 'Everyday essentials') } };
}
