import { execFileSync } from "node:child_process";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  // This endpoint only exists when the isolated local visual-QA launcher opts in.
  // It is unavailable in production and returns no paths, credentials, or user data.
  const worktreeId = process.env.FLEX_SCENES_QA_WORKTREE_ID;
  if (process.env.NODE_ENV !== "development" || !worktreeId) {
    return new Response(null, { status: 404 });
  }

  let commit: string;
  try {
    commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return Response.json({ error: "Build identity unavailable" }, { status: 503 });
  }

  return Response.json(
    { commit, worktreeId },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
