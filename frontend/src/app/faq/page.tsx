import JsonLd from '@/components/JsonLd';

export default function FAQPage() {
  const faqs = [
    {
      question: 'How does Pasalho choose my store?',
      answer:
        'Pasalho uses your delivery location to check the active service zone and assign an eligible fulfillment store. The catalogue then reflects that store.',
    },
    {
      question: 'Do you offer home delivery?',
      answer:
        'Delivery is available only where Pasalho has an active service zone and a store able to fulfill the order. The website shows the current fee and estimated delivery window before the order is placed.',
    },
    {
      question: 'What payment methods do you accept?',
      answer:
        'The current customer-commerce launch uses cash on delivery. Digital payments will appear only after the relevant payment integrations are certified.',
    },
    {
      question: 'Can prices or stock change?',
      answer:
        'Yes. Pasalho revalidates store, stock and pricing during checkout. Inventory is reserved only when the order is successfully accepted.',
    },
    {
      question: 'How can I get help?',
      answer:
        'Use the contact form on this website for customer questions or order support.',
    },
  ];

  return (
    <div className="shell page max-w-4xl">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faqs.map((faq) => ({
            '@type': 'Question',
            name: faq.question,
            acceptedAnswer: { '@type': 'Answer', text: faq.answer },
          })),
        }}
      />
      <p className="eyebrow">PASALHO HELP</p>
      <h1 className="text-4xl font-bold text-gray-900">Frequently asked questions</h1>
      <p className="mt-3 text-lg text-slate-600">Clear answers about store assignment, delivery, stock and checkout.</p>

      <div className="mt-8 space-y-3">
        {faqs.map((faq) => (
          <details key={faq.question} className="rounded-xl border border-slate-200 bg-white p-5">
            <summary className="cursor-pointer font-semibold text-slate-950">{faq.question}</summary>
            <p className="mt-3 leading-7 text-slate-600">{faq.answer}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
