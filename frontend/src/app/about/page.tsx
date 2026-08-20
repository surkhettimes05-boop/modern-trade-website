export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">About StoreSync</h1>
        
        <div className="bg-white rounded-lg shadow-sm p-8 mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Our Story</h2>
          <p className="text-gray-600 mb-4">
            StoreSync is a modern trade platform serving communities across Nepal. We believe in providing quality products, excellent service, and a seamless shopping experience for our customers.
          </p>
          <p className="text-gray-600">
            Our mission is to be the trusted digital operating system for multi-location retail operations, connecting customers with quality products through our network of conveniently located stores.
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-8 mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Our Values</h2>
          <ul className="space-y-3 text-gray-600">
            <li className="flex items-start">
              <span className="text-blue-600 mr-2">•</span>
              <span>Quality: We offer only the best products from trusted brands</span>
            </li>
            <li className="flex items-start">
              <span className="text-blue-600 mr-2">•</span>
              <span>Convenience: Multiple locations and extended hours for your convenience</span>
            </li>
            <li className="flex items-start">
              <span className="text-blue-600 mr-2">•</span>
              <span>Community: We are proud to serve and support local communities</span>
            </li>
            <li className="flex items-start">
              <span className="text-blue-600 mr-2">•</span>
              <span>Innovation: Embracing technology to improve your shopping experience</span>
            </li>
          </ul>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">How we serve shoppers</h2>
          <p className="text-gray-600">NOVA MART combines a focused 642-SKU opening assortment with store-based availability, clear Nepalese-rupee pricing, pickup and eligible Kathmandu delivery. The range is organized across 29 practical departments so everyday essentials remain easy to find.</p>
        </div>
      </div>
    </div>
  );
}
