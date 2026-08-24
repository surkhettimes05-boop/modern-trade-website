import { privateMetadata } from "@/lib/seo";

export const metadata = privateMetadata(
  "WhatsApp order request",
  "/whatsapp-order",
);

export default function WhatsAppOrderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
