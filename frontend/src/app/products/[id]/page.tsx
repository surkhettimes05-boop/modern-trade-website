'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useParams } from 'next/navigation';

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
}

export default function ProductDetailPage() {
  const params = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    async function fetchProduct() {
      setLoading(true);
      try {
        const response = await fetch(`/api/public/products/${params.id}`, { signal: controller.signal });
        setProduct(response.ok ? await response.json() : null);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) console.error('Failed to fetch product:', error);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void fetchProduct();
    return () => controller.abort();
  }, [params.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
            <p className="mt-4 text-gray-600">Loading product...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center py-12">
            <p className="text-gray-600">Product not found</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Product Images */}
          <div>
            <div className="bg-white rounded-lg shadow-sm overflow-hidden mb-4">
              <div className="h-96 bg-gray-200 flex items-center justify-center">
                {product.image_url ? (
                  <Image
                    src={product.image_url}
                    alt={product.name}
                    width={800}
                    height={384}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-gray-400">Product Image</span>
                )}
              </div>
            </div>
            {product.images && product.images.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {product.images.map((image, index) => (
                  <div key={index} className="bg-white rounded-lg shadow-sm overflow-hidden">
                    <div className="h-24 bg-gray-200 flex items-center justify-center">
                      <Image
                        src={image}
                        alt={`${product.name} ${index + 1}`}
                        width={240}
                        height={96}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Product Details */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{product.name}</h1>
            <p className="text-sm text-gray-500 mb-4">SKU: {product.sku}</p>
            
            {product.pack_size && (
              <div className="mb-4">
                <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                  {product.pack_size}
                </span>
              </div>
            )}

            {product.description && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Description</h2>
                <p className="text-gray-600">{product.description}</p>
              </div>
            )}

            <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Availability</h2>
              <p className="text-gray-600">
                This product is available at our store locations. Visit your nearest StoreSync store to purchase.
              </p>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-yellow-800 mb-2">
                Content Placeholder
              </h3>
              <p className="text-yellow-700">
                Product details will be populated from the backend API. Availability information will show store-specific stock status once the inventory system is integrated.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
