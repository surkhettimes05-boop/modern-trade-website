import { Suspense } from "react";
import { AdminWorkspace } from "@/components/admin/AdminWorkspace";
import AdminLoading from "@/app/admin/loading";

export default function AdminCatchAllPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <AdminWorkspace />
    </Suspense>
  );
}
