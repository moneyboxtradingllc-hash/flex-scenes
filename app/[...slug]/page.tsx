import { seedDatabase } from "@/lib/seed";
import { repository } from "@/lib/repository";
import { StudioApp } from "@/components/studio-app";
import { generationService } from "@/lib/services";
import { withLibraryPolishFixtures } from "@/lib/qa-library-fixtures";
export const dynamic = "force-dynamic";
export default async function Catchall({ params, searchParams }: {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  seedDatabase();
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  let initial = JSON.parse(JSON.stringify(repository.snapshot(generationService.capabilities())));
  // Explicit development-only QA fixtures are added to this render snapshot only; they never enter SQLite.
  if (slug.join("/") === "library" && process.env.NODE_ENV === "development" && process.env.FLEX_SCENES_LOCAL_QA === "1" && query.qaLibraryPolish === "1") {
    initial = withLibraryPolishFixtures(initial);
  }
  return <StudioApp initial={initial} route={slug.join("/")} />;
}
