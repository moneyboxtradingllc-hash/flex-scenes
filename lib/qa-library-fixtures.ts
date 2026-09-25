import type { AppSnapshot, MediaAsset } from "@/lib/domain";

/** Adds temporary rendering fixtures to a cloned snapshot. Never persists them. */
export function withLibraryPolishFixtures(snapshot: AppSnapshot): AppSnapshot {
  const template = snapshot.media[0];
  if (!template) return snapshot;
  const createdAt = new Date(Date.now() + 60_000).toISOString();
  const fixture = (id: string, type: MediaAsset["type"], url: string, title: string): MediaAsset => ({
    ...template,
    id,
    type,
    url,
    posterUrl: null,
    title,
    caption: "Temporary visual QA fixture",
    createdAt,
    favorite: false,
    isReference: false,
    providerId: "qa-only",
    settingsJson: JSON.stringify({ duration: 5, aspectRatio: "9:16", source: "qa-only" }),
  });
  const qaMedia = [
    fixture("qa-library-video-no-poster", "video", "/api/qa/reel-playback-fixture.mp4", "QA video without poster"),
    fixture("qa-library-video-missing-file", "video", "/__qa_missing_library_video__.mp4", "QA missing video file"),
    fixture("qa-library-image-missing-file", "image", "/__qa_missing_library_image__.png", "QA bad image URL"),
  ];
  const qaIds = qaMedia.map((asset) => asset.id);
  const collections = snapshot.collections.length ? snapshot.collections.map((collection, index) => index === 0
    ? { ...collection, mediaIds: [...new Set([...qaMedia.map((asset) => asset.id), ...collection.mediaIds])] }
    : collection) : [{ id: "qa-library-polish-collection", name: "QA Preview Set", mediaIds: qaIds }];
  return { ...snapshot, media: [...snapshot.media, ...qaMedia], collections };
}
