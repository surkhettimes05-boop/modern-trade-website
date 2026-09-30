'use client';

import { CheckCircle2, MapPin, Navigation } from 'lucide-react';
import { LocationPicker, useShop } from '@/components/CommerceClient';

export default function StoresPage() {
  const { delivery } = useShop();

  return (
    <div className="shell page serviceability-page">
      <p className="eyebrow">PASALHO FULFILLMENT</p>
      <h1>Your location chooses the right store.</h1>
      <p className="serviceability-intro">
        You do not need to pick a branch manually. Pasalho resolves your
        delivery point to an eligible store, then shows that store&apos;s live
        inventory, pricing, delivery fee and ETA.
      </p>

      <LocationPicker prominent />

      {delivery ? (
        <section className="serving-store-card">
          <div className="serving-store-icon"><CheckCircle2 /></div>
          <div>
            <span>Serving store</span>
            <h2>{delivery.storeName}</h2>
            <p>{delivery.serviceZoneName}</p>
          </div>
          <div className="serving-store-meta">
            <span>
              <Navigation /> {delivery.etaMinMinutes}–{delivery.etaMaxMinutes} min estimate
            </span>
            <span><MapPin /> Delivery zone confirmed</span>
          </div>
        </section>
      ) : (
        <section className="serving-store-card pending">
          <MapPin />
          <div>
            <h2>Set your delivery location</h2>
            <p>Pasalho will assign the appropriate fulfillment store automatically.</p>
          </div>
        </section>
      )}
    </div>
  );
}
