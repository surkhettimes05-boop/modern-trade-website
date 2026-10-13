import JsonLd from '@/components/JsonLd';

export default function FAQPage() {
  const faqs = [
    {
      question: "Where can I shop with Pasalho?",
      answer: "Pasalho's online shopping pilot focuses on Birendranagar, Surkhet. Delivery and pickup availability are confirmed for the selected store and address at checkout."
    },
    {
      question: "Do you offer home delivery?",
      answer: "Delivery or pickup may be available in Birendranagar, Surkhet, depending on the selected store and address. Confirm serviceability at checkout before placing your order."
    },
    {
      question: "What payment methods do you accept?",
      answer: "The Birendranagar pilot accepts cash on delivery and cash at store pickup. Electronic payment methods are not enabled."
    },
    {
      question: "How can I contact customer support?",
      answer: "Use the Pasalho contact page or the phone number shown for a published store in the store directory. Store hours and contact details are shown there when available."
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map((faq) => ({ '@type': 'Question', name: faq.question, acceptedAnswer: { '@type': 'Answer', text: faq.answer } })) }} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Pasalho FAQs for Birendranagar, Surkhet</h1>
        <p className="text-xl text-gray-600 mb-8">
          Find answers to common questions about Pasalho
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

        <div className="mt-12 p-6 bg-emerald-50 border border-emerald-200 rounded-lg">
          <h2 className="text-lg font-semibold text-emerald-900 mb-2">Still need help?</h2>
          <p className="text-emerald-800">Contact Pasalho support or ask the team at your selected store for information specific to your location.</p>
        </div>
      </div>
    </div>
  );
}
