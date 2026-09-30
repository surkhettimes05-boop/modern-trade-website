"use client";

import { usePathname } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SkipLink from "@/components/SkipLink";
import { MobileCartBar, MobileNav } from "@/components/CommerceClient";

export default function RouteChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isStaffWorkspace =
    pathname.startsWith("/admin") || pathname.startsWith("/operations");

  if (isStaffWorkspace) return children;

  return (
    <>
      <SkipLink />
      <Header />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <Footer />
      {!pathname.startsWith("/cart") && !pathname.startsWith("/checkout") ? (
        <MobileCartBar />
      ) : null}
      <MobileNav />
    </>
  );
}
