import { privateMetadata } from "@/lib/seo";

export const metadata = privateMetadata(
  "Saved delivery addresses",
  "/account/addresses",
);

export default function AddressLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
