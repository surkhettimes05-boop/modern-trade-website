export default function LoyaltyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-gradient-to-r from-purple-600 to-purple-800 rounded-2xl p-8 md:p-12 text-white mb-8">
          <h1 className="text-4xl font-bold mb-4">Loyalty Program Coming Soon</h1>
          <p className="text-xl text-purple-100 mb-6">
            Earn points on every purchase and redeem them for exciting rewards
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div className="bg-white rounded-lg shadow-sm p-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">How It Will Work</h2>
            <ul className="space-y-3 text-gray-600">
              <li className="flex items-start">
                <span className="text-purple-600 mr-2">1.</span>
                <span>Sign up for a free loyalty account at any StoreSync location</span>
              </li>
              <li className="flex items-start">
                <span className="text-purple-600 mr-2">2.</span>
                <span>Earn points on every eligible purchase</span>
              </li>
              <li className="flex items-start">
                <span className="text-purple-600 mr-2">3.</span>
                <span>Track your points balance through our website</span>
              </li>
              <li className="flex items-start">
                <span className="text-purple-600 mr-2">4.</span>
                <span>Redeem points for discounts and special offers</span>
              </li>
            </ul>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">Benefits</h2>
            <ul className="space-y-3 text-gray-600">
              <li className="flex items-start">
                <svg className="w-5 h-5 text-purple-600 mr-2 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Earn points on every purchase</span>
              </li>
              <li className="flex items-start">
                <svg className="w-5 h-5 text-purple-600 mr-2 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Exclusive member-only offers</span>
              </li>
              <li className="flex items-start">
                <svg className="w-5 h-5 text-purple-600 mr-2 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Birthday rewards</span>
              </li>
              <li className="flex items-start">
                <svg className="w-5 h-5 text-purple-600 mr-2 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Early access to promotions</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-8 mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Stay Informed</h2>
          <p className="text-gray-600 mb-4">
            Be the first to know when our loyalty program launches. Sign up for updates and we'll notify you as soon as it's available.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <input
              type="email"
              placeholder="Enter your email address"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <button className="bg-purple-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-purple-700 transition-colors">
              Notify Me
            </button>
          </div>
        </div>

        <div className="p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 className="text-lg font-semibold text-yellow-800 mb-2">
            Program Status
          </h3>
          <p className="text-yellow-700">
            The loyalty program is currently under development. Features and benefits described here are subject to change. Final program details will be announced before launch.
          </p>
        </div>
      </div>
    </div>
  );
}
