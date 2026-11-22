"use client";

import { usePathname } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SkipLink from "@/components/SkipLink";
import { MobileNav } from "@/components/CommerceClient";
import WhatsAppOrderShortcut from "@/components/WhatsAppOrderShortcut";

export default function RouteChrome({
  children,
  browseOnly = false,
}: {
  children: React.ReactNode;
  browseOnly?: boolean;
}) {
  const pathname = usePathname();
  const isStaffWorkspace =
    pathname.startsWith("/admin") || pathname.startsWith("/operations");

  if (isStaffWorkspace) return children;

  return (
    <>
      <SkipLink />
      <Header browseOnly={browseOnly} />
      {browseOnly && <div role="status" className="border-b border-amber-300 bg-amber-100 px-4 py-3 text-center text-sm font-semibold text-amber-950">
        PASALHO catalogue preview — browse products and stores, or send a manual order request through WhatsApp. Online checkout and accounts are not open; the store must confirm stock, price, delivery, and your order.
      </div>}
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <Footer browseOnly={browseOnly} />
      <WhatsAppOrderShortcut />
      <MobileNav />
    </>
  );
}
