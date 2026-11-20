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
        PASALHO catalogue preview — browse products and stores. Registration, memberships, creator sign-up, and orders are opening later.
      </div>}
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <Footer />
      {!browseOnly && <WhatsAppOrderShortcut />}
      <MobileNav />
    </>
  );
}
