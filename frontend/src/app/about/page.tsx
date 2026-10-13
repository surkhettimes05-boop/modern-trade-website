export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">About Pasalho</h1>
        <p className="text-xl text-gray-600 mb-8">Everyday shopping for Birendranagar, Surkhet.</p>

        <div className="bg-white rounded-lg shadow-sm p-8 mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">What we are building</h2>
          <p className="text-gray-600 mb-4">
            Pasalho is focused on dependable everyday shopping for Birendranagar, Surkhet: clear prices,
            store-based stock, convenient pickup, and delivery only where the selected store can reliably serve.
          </p>
          <p className="text-gray-600">
            Our online experience is connected to the same store inventory used to fulfil customer orders, so
            availability and fulfilment decisions come from the selected Pasalho store rather than from a separate catalogue.
            Delivery availability depends on the selected store and service area shown at checkout.
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">How we serve shoppers</h2>
          <ul className="space-y-3 text-gray-600">
            <li>• Everyday groceries and household essentials with NPR pricing.</li>
            <li>• Cash on delivery and store pickup for eligible orders.</li>
            <li>• Delivery fees and availability based on the selected store and service area.</li>
            <li>• Customer accounts linked to a verified Nepal mobile number.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
