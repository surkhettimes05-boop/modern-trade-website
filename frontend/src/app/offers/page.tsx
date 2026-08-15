'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

interface Offer {
  id: string;
  title: string;
  description: string;
  image_url: string;
  banner_image_url: string;
  start_date: string;
  end_date: string;
  terms: string;
  is_featured: boolean;
  sort_order: number;
}

export default function OffersPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOffers();
  }, []);

  async function fetchOffers() {
    try {
      const response = await fetch('/api/public/offers');
      if (response.ok) {
        const data = await response.json();
        setOffers(data);
      }
    } catch (error) {
      console.error('Failed to fetch offers:', error);
    } finally {
      setLoading(false);
    }
  }

  const featuredOffers = offers.filter((offer) => offer.is_featured);
  const regularOffers = offers.filter((offer) => !offer.is_featured);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Current Offers</h1>
        <p className="text-xl text-gray-600 mb-8">
          Don't miss out on these great deals
        </p>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
            <p className="mt-4 text-gray-600">Loading offers...</p>
          </div>
        ) : offers.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600">No current offers</p>
            <div className="mt-4 p-6 bg-yellow-50 border border-yellow-200 rounded-lg inline-block">
              <p className="text-yellow-700">
                Offers will be populated from the backend API once the database is set up and campaigns are created through the admin interface.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Featured Offers */}
            {featuredOffers.length > 0 && (
              <div className="mb-12">
                <h2 className="text-2xl font-semibold text-gray-900 mb-6">Featured Offers</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {featuredOffers.map((offer) => (
                    <div key={offer.id} className="bg-white rounded-lg shadow-sm overflow-hidden">
                      {offer.banner_image_url ? (
                        <Image
                          src={offer.banner_image_url}
                          alt={offer.title}
                          width={900}
                          height={192}
                          className="w-full h-48 object-cover"
                        />
                      ) : (
                        <div className="h-48 bg-gradient-to-r from-blue-600 to-blue-800 flex items-center justify-center">
                          <span className="text-white text-2xl font-bold">Featured Offer</span>
                        </div>
                      )}
                      <div className="p-6">
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">{offer.title}</h3>
                        <p className="text-gray-600 mb-4">{offer.description}</p>
                        <div className="flex items-center text-sm text-gray-500 mb-4">
                          <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span>
                            {new Date(offer.start_date).toLocaleDateString()} - {new Date(offer.end_date).toLocaleDateString()}
                          </span>
                        </div>
                        {offer.terms && (
                          <p className="text-sm text-gray-500">{offer.terms}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Regular Offers */}
            {regularOffers.length > 0 && (
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 mb-6">All Offers</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {regularOffers.map((offer) => (
                    <div key={offer.id} className="bg-white rounded-lg shadow-sm overflow-hidden">
                      {offer.image_url ? (
                        <Image
                          src={offer.image_url}
                          alt={offer.title}
                          width={600}
                          height={128}
                          className="w-full h-32 object-cover"
                        />
                      ) : (
                        <div className="h-32 bg-gradient-to-r from-green-600 to-green-800 flex items-center justify-center">
                          <span className="text-white font-bold">Offer</span>
                        </div>
                      )}
                      <div className="p-4">
                        <h3 className="font-semibold text-gray-900 mb-2">{offer.title}</h3>
                        <p className="text-sm text-gray-600 mb-3">{offer.description}</p>
                        <div className="flex items-center text-xs text-gray-500">
                          <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span>
                            {new Date(offer.start_date).toLocaleDateString()} - {new Date(offer.end_date).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
