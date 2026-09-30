export default function AboutPage() {
  return (
    <div className="shell page max-w-5xl">
      <p className="eyebrow">ABOUT PASALHO</p>
      <h1 className="text-4xl font-bold text-gray-900">Built for everyday commerce in Surkhet</h1>
      <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">
        Pasalho combines physical retail, distribution and customer commerce around one inventory and order system. The customer website is designed to show the store, stock, pricing and delivery options that can actually serve a shopper.
      </p>

      <div className="mt-10 grid gap-5 md:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold">Useful assortment</h2>
          <p className="mt-3 text-slate-600">Focus on groceries, household essentials and other practical categories customers buy repeatedly.</p>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold">Store-based truth</h2>
          <p className="mt-3 text-slate-600">Availability and prices are tied to the Pasalho fulfillment store selected for the customer&apos;s service area.</p>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold">Practical delivery</h2>
          <p className="mt-3 text-slate-600">Pasalho shows a realistic delivery estimate instead of making a speed promise the operation cannot support.</p>
        </section>
      </div>

      <section className="mt-10 rounded-2xl bg-emerald-950 p-8 text-white">
        <h2 className="text-2xl font-semibold">One operating system behind every channel</h2>
        <p className="mt-3 max-w-3xl leading-7 text-emerald-100">
          The long-term Pasalho model connects stores, warehouse operations, POS, customer commerce and field sales to one backend so stock and orders do not diverge between channels.
        </p>
      </section>
    </div>
  );
}
