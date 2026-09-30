export default function TermsPage() {
  return (
    <div className="shell page max-w-4xl">
      <h1 className="text-4xl font-bold text-gray-900">Terms of Service</h1>
      <p className="mt-3 text-sm text-slate-500">Draft terms — legal review required before production publication.</p>

      <div className="mt-8 space-y-7 rounded-2xl border border-slate-200 bg-white p-8 text-slate-600">
        <section>
          <h2 className="text-2xl font-semibold text-slate-950">Using Pasalho</h2>
          <p className="mt-3">These draft terms describe use of the Pasalho customer website and related order services in Nepal. Final commercial and legal terms must be approved before launch.</p>
        </section>
        <section>
          <h2 className="text-2xl font-semibold text-slate-950">Availability and pricing</h2>
          <p className="mt-3">Products, prices, delivery fees, delivery estimates and serviceability may vary by fulfillment store and can change before checkout. Pasalho revalidates relevant order information before accepting an order.</p>
        </section>
        <section>
          <h2 className="text-2xl font-semibold text-slate-950">Orders and payment</h2>
          <p className="mt-3">An order is accepted only when Pasalho creates the order successfully. The current customer-commerce launch supports cash on delivery. Additional payment methods require separate activation and terms.</p>
        </section>
        <section>
          <h2 className="text-2xl font-semibold text-slate-950">Cancellations</h2>
          <p className="mt-3">Customer cancellation is available only while an order remains in a cancellable state. Once picking or later fulfillment has begun, different operational rules may apply.</p>
        </section>
        <section>
          <h2 className="text-2xl font-semibold text-slate-950">Governing law</h2>
          <p className="mt-3">The final terms will be governed by applicable law in Nepal. This draft does not attempt to replace legal review.</p>
        </section>
        <section>
          <h2 className="text-2xl font-semibold text-slate-950">Terms status</h2>
          <p className="mt-3">These draft terms remain excluded from search indexing until reviewed and approved. Questions can be submitted through the website contact form.</p>
        </section>
      </div>
    </div>
  );
}
