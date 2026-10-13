import type { Metadata } from "next";
import FoundersClient from "./FoundersClient";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Founding 1,000",
  description: "Join Pasalho's first 1,000 customers in Birendranagar and get early access to opening benefits.",
  path: "/founders",
});

export default function FoundersPage() {
  return <FoundersClient />;
}
