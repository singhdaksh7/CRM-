import { redirect } from "next/navigation";

/**
 * The shortlist-building UI now lives at a single canonical route,
 * `/leads/[id]/match` (see src/components/leads/property-matching-workspace.tsx).
 * This route is kept only so any existing bookmarks/links to
 * "Build New Catalogue" keep working - redirect rather than duplicate the UI.
 */
export default async function NewCataloguePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/leads/${id}/match`);
}
