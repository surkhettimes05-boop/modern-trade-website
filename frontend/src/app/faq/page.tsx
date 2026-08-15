export default function FAQPage() {
  const faqs = [
    {
      question: "What are your store hours?",
      answer: "Our stores are typically open Sunday through Friday from 9:00 AM to 9:00 PM, and Saturday from 10:00 AM to 8:00 PM. Hours may vary by location."
    },
    {
      question: "Do you offer home delivery?",
      answer: "Currently, we offer in-store shopping. Home delivery services are being planned for a future phase. Please check our website for updates."
    },
    {
      question: "What payment methods do you accept?",
      answer: "We accept cash, major credit/debit cards, and mobile payment options including eSewa and Khalti."
    },
    {
      question: "Can I return items?",
      answer: "Yes, we have a return policy for eligible items. Please bring your receipt and the item in its original condition. Returns are handled on a case-by-case basis."
    },
    {
      question: "Do you have a loyalty program?",
      answer: "Our loyalty program is coming soon! You'll be able to earn points on purchases and redeem them for rewards. Stay tuned for announcements."
    },
    {
      question: "How can I contact customer support?",
      answer: "You can reach us through our contact form on this website, call our customer service line, or visit any of our store locations during business hours."
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Frequently Asked Questions</h1>
        <p className="text-xl text-gray-600 mb-8">
          Find answers to common questions about StoreSync
        </p>

        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <div key={index} className="bg-white rounded-lg shadow-sm">
              <details className="group">
                <summary className="flex items-center justify-between p-6 cursor-pointer">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {faq.question}
                  </h3>
                  <svg className="w-5 h-5 text-gray-500 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <div className="px-6 pb-6">
                  <p className="text-gray-600">{faq.answer}</p>
                </div>
              </details>
            </div>
          ))}
        </div>

        <div className="mt-12 p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 className="text-lg font-semibold text-yellow-800 mb-2">
            Content Placeholder
          </h3>
          <p className="text-yellow-700">
            FAQ content will be managed through the content management system. Categories and answers can be organized and updated by administrators.
          </p>
        </div>
      </div>
    </div>
  );
}
