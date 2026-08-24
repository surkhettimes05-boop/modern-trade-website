"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { useShop } from "@/components/CommerceClient";

export default function WhatsAppOrderShortcut() {
  const { items } = useShop();
  const pathname = usePathname();
  if (!items.length || pathname === "/whatsapp-order") return null;

  const count = items.reduce((total, item) => total + item.qty, 0);
  return (
    <Link
      href="/whatsapp-order"
      className="fixed bottom-20 right-5 z-[75] flex h-14 w-14 items-center justify-center rounded-full bg-[#168b52] text-white shadow-xl transition-transform hover:scale-105 md:bottom-6"
      aria-label={`Prepare WhatsApp order for ${count} cart item${count === 1 ? "" : "s"}`}
    >
      <MessageCircle size={28} />
      <span className="absolute -right-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full border-2 border-white bg-red-700 px-1 text-xs font-black">
        {count}
      </span>
    </Link>
  );
}
