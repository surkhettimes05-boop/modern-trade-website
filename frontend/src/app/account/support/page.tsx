'use client';

import { useState } from 'react';
import { resilientFetch } from '@/lib/resilientFetch';

export default function SupportPage() {
  const [requestType, setRequestType] = useState<'missing_points' | 'general'>('missing_points');
  const [saleNumber, setSaleNumber] = useState('');
  const [saleDate, setSaleDate] = useState('');
  const [storeLocation, setStoreLocation] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const customerResponse = await resilientFetch('/api/auth/session/validate', {
      });
      const customerData = await customerResponse.json();

      const response = await resilientFetch('/api/consent/data-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customerData.customer.id,
          request_type: requestType === 'missing_points' ? 'CORRECTION' : 'ACCESS',
          notes: JSON.stringify({
            sale_number: saleNumber,
            sale_date: saleDate,
            store_location: storeLocation,
            description,
          }),
        }),
      });

      if (response.ok) {
        setSubmitted(true);
      } else {
        const data = await response.json();
        throw new Error(data.error || 'Failed to submit request');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit request');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <a href="/account/dashboard" className="text-blue-600 hover:text-blue-700">
              ← Back to Dashboard
            </a>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Request Submitted</h1>
            <p className="text-gray-600 mb-6">
              Your request has been submitted successfully. Our team will review it and get back to you within 2-3 business days.
            </p>
            <a
              href="/account/dashboard"
              className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
            >
              Back to Dashboard
            </a>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <a href="/account/dashboard" className="text-blue-600 hover:text-blue-700">
            ← Back to Dashboard
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Support Request</h1>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex space-x-4 mb-6">
            <button
              onClick={() => setRequestType('missing_points')}
              className={`flex-1 py-3 px-4 rounded-lg font-medium ${
                requestType === 'missing_points'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Missing Points
            </button>
            <button
              onClick={() => setRequestType('general')}
              className={`flex-1 py-3 px-4 rounded-lg font-medium ${
                requestType === 'general'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              General Inquiry
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {requestType === 'missing_points' && (
              <>
                <div>
                  <label htmlFor="saleNumber" className="block text-sm font-medium text-gray-700 mb-2">
                    Sale Number (if available)
                  </label>
                  <input
                    type="text"
                    id="saleNumber"
                    value={saleNumber}
                    onChange={(e) => setSaleNumber(e.target.value)}
                    placeholder="e.g., SALE-12345"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label htmlFor="saleDate" className="block text-sm font-medium text-gray-700 mb-2">
                    Date of Purchase
                  </label>
                  <input
                    type="date"
                    id="saleDate"
                    value={saleDate}
                    onChange={(e) => setSaleDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label htmlFor="storeLocation" className="block text-sm font-medium text-gray-700 mb-2">
                    Store Location
                  </label>
                  <input
                    type="text"
                    id="storeLocation"
                    value={storeLocation}
                    onChange={(e) => setStoreLocation(e.target.value)}
                    placeholder="e.g., Kathmandu Thamel Store"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </>
            )}

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="Please describe your issue in detail..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
            >
              {loading ? 'Submitting...' : 'Submit Request'}
            </button>
          </form>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-2">What happens next?</h3>
          <ul className="text-sm text-blue-800 space-y-2">
            <li>• Our team will review your request within 2-3 business days</li>
            <li>• We may contact you for additional information if needed</li>
            <li>• You'll receive a notification when your request is resolved</li>
            <li>• For urgent matters, please visit your nearest store</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
