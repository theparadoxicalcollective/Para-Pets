import { Suspense, type ReactNode } from "react";
import LoadingScreen from "@/components/LoadingScreen";
import { lazyWithRetry } from "@/lib/lazyWithRetry";

// Keep these editor imports behind their existing section/overlay mount points.
// The retry helper uses the same stale-deploy recovery as the game routes.
export const PetDatabasePanel = lazyWithRetry(() => import("@/components/PetDatabasePanel"));
export const HomeBundleSection = lazyWithRetry(() => import("@/components/HomeBundleSection"));
export const CardAdminPanel = lazyWithRetry(() => import("@/components/CardAdminPanel"));

/** Catch editor loading locally so the AdminPage and its draft state stay mounted. */
export function AdminEditorLoader({ label, children }: { label: string; children: ReactNode }) {
  return <Suspense fallback={<LoadingScreen label={label} />}>{children}</Suspense>;
}
