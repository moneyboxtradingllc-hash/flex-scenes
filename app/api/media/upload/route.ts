import { randomUUID } from "node:crypto";
import { LocalMediaStore } from "@/lib/storage";
import { repository } from "@/lib/repository";
import type { MediaAsset } from "@/lib/domain";

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  const characterId = String(form.get("characterId") ?? "");
  const setAsPortrait = form.get("setAsPortrait") === "true";
  if (!(file instanceof File) || !characterId) return Response.json({ error: "A character and an image or video file are required." }, { status: 400 });
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) return Response.json({ error: "Only image and video reference assets are supported." }, { status: 400 });
  if (setAsPortrait && !file.type.startsWith("image/")) return Response.json({ error: "Character portraits must be images." }, { status: 400 });
  if (file.size > 50 * 1024 * 1024) return Response.json({ error: "Local development imports are limited to 50 MB." }, { status: 413 });
  const roleValue = setAsPortrait ? "face" : String(form.get("referenceRole") ?? "");
  const roles = ["face", "body", "hair", "look", "outfit", "environment", "pose", "motion", "video", "other"] as const;
  const role = roles.find((item) => item === roleValue);
  if (!repository.character(characterId)?.id) return Response.json({ error: "Character not found." }, { status: 404 });
  if (roleValue && !role) return Response.json({ error: "Reference category is invalid." }, { status: 400 });
  const id = randomUUID();
  const type = file.type.startsWith("video/") ? "video" : "image";
  const url = new LocalMediaStore().saveUpload(id, file.name, Buffer.from(await file.arrayBuffer()));
  const asset: MediaAsset = { id, characterId, type, url, posterUrl: type === "video" ? null : url, title: file.name, caption: setAsPortrait ? "Character portrait" : "Local reference import", prompt: "", providerId: "local-import", settingsJson: JSON.stringify({ source: "local-import", mime: file.type }), parentId: null, isReference: Boolean(role), createdAt: new Date().toISOString(), favorite: false };
  try {
    if (setAsPortrait) repository.saveCharacterPortraitReference(asset);
    else if (role) repository.saveMediaAsCharacterReference(asset, role, form.get("canonical") === "true");
    else repository.saveMedia(asset);
  } catch (error) {
    new LocalMediaStore().removeUpload(url);
    throw error;
  }
  return Response.json(asset, { status: 201 });
}
