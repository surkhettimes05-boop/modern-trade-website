export default function PrivacyPage() {
  return (
    <div className="shell page max-w-4xl">
      <h1 className="text-4xl font-bold text-gray-900">Privacy Policy</h1>
      <p className="mt-3 text-sm text-slate-500">Draft policy — review required before production publication.</p>

      <div className="mt-8 space-y-7 rounded-2xl border border-slate-200 bg-white p-8 text-slate-600">
        <section>
          <h2 className="text-2xl font-semibold text-slate-950">Introduction</h2>
          <p className="mt-3">Pasalho uses customer information to provide account access, serviceability checks, delivery, order processing and customer support.</p>
        </section>
        <section>
          <h2 className="text-2xl font-semibold text-slate-950">Information we may collect</h2>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>Phone number and account information provided during OTP sign-in.</li>
            <li>Saved delivery addresses, coordinates and delivery instructions.</li>
            <li>Cart, order and fulfillment history.</li>
            <li>Contact-form information and basic technical/security logs.</li>
          </ul>
        </section>
        <section>
          <h2 className="text-2xl font-semibold text-slate-950">Location data</h2>
          <p className="mt-3">When you choose to share browser location, Pasalho uses the coordinates to resolve serviceability and the fulfillment store. The customer interface does not require continuous background location tracking.</p>
        </section>
        <section>
          <h2 className="text-2xl font-semibold text-slate-950">Security</h2>
          <p className="mt-3">Pasalho uses technical and organizational safeguards intended to protect customer information, but no internet transmission or storage system can be guaranteed completely secure.</p>
        </section>
        <section>
          <h2 className="text-2xl font-semibold text-slate-950">Contact</h2>
          <p className="mt-3">Questions about this draft policy can be submitted through the website contact form.</p>
        </section>
        <section>
          <h2 className="text-2xl font-semibold text-slate-950">Policy status</h2>
          <p className="mt-3">This draft remains excluded from search indexing until the final legal policy is reviewed and approved.</p>
        </section>
      </div>
    </div>
  );
}
