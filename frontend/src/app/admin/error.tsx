"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/admin/AdminPrimitives";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <ErrorState
        message="The administration page encountered an unexpected error."
        retry={reset}
      />
    </div>
  );
}
