'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  category_id: string;
  pack_size: string;
  unit: string;
  image_url: string;
  images: string[];
  is_featured: boolean;
  price: number;
  availability_status: string;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  image_url: string;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    async function fetchData() {
      setLoading(true);
      try {
        const [productsRes, categoriesRes] = await Promise.all([
          fetch(`/api/public/products${selectedCategory ? `?category=${selectedCategory}` : ''}`, { signal: controller.signal }),
          fetch('/api/public/categories', { signal: controller.signal }),
        ]);
        if (productsRes.ok && categoriesRes.ok) {
          setProducts(await productsRes.json());
          setCategories(await categoriesRes.json());
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) console.error('Failed to fetch data:', error);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void fetchData();
    return () => controller.abort();
  }, [selectedCategory]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Products</h1>
        <p className="text-xl text-gray-600 mb-8">
          Browse our selection of quality products
        </p>

        {/* Category Filter */}
        <div className="mb-8">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory('')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                selectedCategory === ''
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              All Products
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  selectedCategory === category.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
            <p className="mt-4 text-gray-600">Loading products...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600">No products found</p>
            <div className="mt-4 p-6 bg-yellow-50 border border-yellow-200 rounded-lg inline-block">
              <p className="text-yellow-700">
                Products will be populated from the backend API once the database is set up and content is added through the admin interface.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {products.map((product) => (
              <div key={product.id} className="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                <div className="h-48 bg-gray-200 flex items-center justify-center">
                  {product.image_url ? (
                    <Image
                      src={product.image_url}
                      alt={product.name}
                      width={400}
                      height={240}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-gray-400">Product Image</span>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 mb-1">{product.name}</h3>
                  <p className="font-semibold text-gray-900">₹{product.price}</p>
                  <p className="text-sm text-emerald-700">{product.availability_status.replaceAll('_', ' ')}</p>
                  {product.pack_size && (
                    <p className="text-sm text-gray-600 mb-2">{product.pack_size}</p>
                  )}
                  {product.description && (
                    <p className="text-sm text-gray-500 line-clamp-2">{product.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
