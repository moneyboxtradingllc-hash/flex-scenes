"""Selective M6.2 cleanup for positively identified seed fixtures only.

Run only after creating a verified SQLite backup:
python scripts/clean-known-demo-data.py data/flex-scenes.db <backup.db
"""
import json
import os
import sqlite3
import sys
from pathlib import Path

if len(sys.argv) != 3:
    raise SystemExit("Usage: clean-known-demo-data.py <database> <verified-backup>")
db_path, backup_path = map(Path, sys.argv[1:])
if not db_path.is_file() or not backup_path.is_file() or backup_path.stat().st_size < 4096:
    raise SystemExit("Database or verified backup is missing/too small; refusing cleanup.")
if db_path.resolve() == backup_path.resolve():
    raise SystemExit("Backup must be separate from the live database.")

connection = sqlite3.connect(db_path)
connection.execute("PRAGMA foreign_keys=ON")
connection.row_factory = sqlite3.Row
fixtures = connection.execute("SELECT id,characterId,url FROM media WHERE providerId LIKE 'fixture-%' OR url LIKE '/fixtures/scene-%'").fetchall()
fixture_ids = {row["id"] for row in fixtures}
fixture_url_paths = {row["url"] for row in fixtures if row["url"].startswith("/fixtures/scene-")}
portrait_ids = [row[0] for row in connection.execute("SELECT id FROM characters WHERE id IN ('char-nova','char-iona','char-mara') AND portraitUrl IN ('/fixtures/char-nova-portrait.svg','/fixtures/char-iona-portrait.svg','/fixtures/char-mara-portrait.svg')")]
report = {"fixtureMediaRemoved": len(fixture_ids), "seedMessagesRemoved": 0, "nightStudiesRemoved": 0, "portraitsCleared": len(portrait_ids), "seedIdentityFieldsCleared": 0, "seedBrainFieldsCleared": 0, "seedMemoryFieldsCleared": 0, "characterRecordsPreserved": 0}
seed_names = {"char-nova": "Nova Vale", "char-iona": "Iona Reed", "char-mara": "Mara Sol"}
seed_identity = {
    "char-nova": {"handle": "@novavale", "description": "Cinematic muse with a sharp eye for light.", "personality": "Warm, concise, visually observant.", "identityNotes": "Warm complexion, long dark auburn hair, freckles, editorial wardrobe."},
    "char-iona": {"handle": "@ionareed", "description": "Architect of quiet, electric scenes.", "personality": "Thoughtful, dry humor, patient.", "identityNotes": "Short dark curls, sculptural silhouettes, cobalt accents."},
    "char-mara": {"handle": "@marasol", "description": "Golden-hour storyteller and collector of small details.", "personality": "Direct, playful, optimistic.", "identityNotes": "Honey-toned skin, copper waves, luminous styling."},
}
seed_memory_fields = {
    "char-nova": {"recentLocations": "rain-lit glass atrium", "recentWardrobes": "tailored charcoal", "recentLightings": "violet practicals", "recentMoods": "after-hours calm", "recentShotTypes": "three-quarter portrait", "recentCameraDirections": "locked and deliberate"},
    "char-iona": {"recentLocations": "modern train platform at blue hour", "recentWardrobes": "sculptural black", "recentLightings": "cool side light", "recentMoods": "composed solitude", "recentShotTypes": "symmetrical wide", "recentCameraDirections": "static frame"},
    "char-mara": {"recentLocations": "sunroom in afternoon", "recentWardrobes": "soft linen", "recentLightings": "warm afternoon sun", "recentMoods": "bright intimacy", "recentShotTypes": "candid medium", "recentCameraDirections": "gentle handheld drift"},
}
seed_conversation_fields = {
    "char-nova": {"speakingStyle": "Sensory, assured, concise, and warm.", "vocabulary": ["glass", "light", "framing", "stillness"], "confidence": 0.72, "humorStyle": "Dry, gentle wit.", "emotionalExpressiveness": 0.58, "attitude": "Observant and self-possessed."},
    "char-iona": {"speakingStyle": "Measured, precise, economical, and thoughtful.", "vocabulary": ["geometry", "line", "structure", "negative space"], "confidence": 0.62, "humorStyle": "Understated, wry observation.", "emotionalExpressiveness": 0.35, "attitude": "Patient and analytical."},
    "char-mara": {"speakingStyle": "Lively, candid, tactile, and playful.", "vocabulary": ["golden", "little detail", "warmth", "motion"], "confidence": 0.84, "humorStyle": "Open and affectionate playfulness.", "emotionalExpressiveness": 0.88, "attitude": "Optimistic and experimentally minded."},
}
seed_creative_fields = {
    "char-nova": {"favoriteEnvironments": ["rain-lit conservatory", "rooftop observatory", "late-night gallery", "glass atrium"], "wardrobeCategories": ["tailored charcoal", "silk editorial", "structured eveningwear"], "preferredLighting": ["violet practicals", "rain reflections", "softbox edge light"], "preferredMoods": ["quiet confidence", "after-hours calm", "anticipation"], "preferredShotTypes": ["three-quarter portrait", "environmental close-up", "full-length editorial"], "cameraEnergy": ["slow push-in", "locked and deliberate", "gentle orbit"], "mediaBalance": "balanced", "experimentationLevel": 0.68, "visualThemes": ["city reflections", "negative space", "glass geometry"], "avoidedThemes": ["overcrowded sets", "flat frontal lighting"], "ideasToTry": ["observatory after rain", "reflections split across glass"], "ideasTiredOf": ["bedroom repeats"], "creativeBoldness": 0.68, "noveltyPreference": 0.78, "repetitionTolerance": 0.22},
    "char-iona": {"favoriteEnvironments": ["brutalist gallery", "empty train platform", "concrete archive", "blue-hour passage"], "wardrobeCategories": ["sculptural black", "cobalt tailoring", "architectural layers"], "preferredLighting": ["blue-hour sidelight", "hard geometric shadow", "cool reflected light"], "preferredMoods": ["composed solitude", "quiet tension", "focused calm"], "preferredShotTypes": ["symmetrical wide", "profile detail", "long-lens environmental"], "cameraEnergy": ["static frame", "measured lateral track", "slow reveal"], "mediaBalance": "image", "experimentationLevel": 0.42, "visualThemes": ["architectural lines", "cobalt accents", "quiet transit"], "avoidedThemes": ["busy patterns", "handheld chaos"], "ideasToTry": ["a station before first train", "portrait framed by repeating columns"], "ideasTiredOf": ["soft-focus bedroom portrait"], "creativeBoldness": 0.45, "noveltyPreference": 0.52, "repetitionTolerance": 0.48},
    "char-mara": {"favoriteEnvironments": ["sunroom at noon", "roadside diner at dawn", "tile-roof courtyard", "flower market after rain"], "wardrobeCategories": ["soft linen", "copper knit", "colorful vintage"], "preferredLighting": ["late golden hour", "sun patches", "warm practical bulbs"], "preferredMoods": ["bright intimacy", "playful nostalgia", "easy confidence"], "preferredShotTypes": ["candid medium", "detail-rich close-up", "moving full-length"], "cameraEnergy": ["handheld drift", "playful follow", "gentle handheld push"], "mediaBalance": "video", "experimentationLevel": 0.82, "visualThemes": ["small lived-in details", "warm color", "everyday magic"], "avoidedThemes": ["sterile sets", "cold monochrome"], "ideasToTry": ["diner before sunrise", "wind moving a curtain into frame"], "ideasTiredOf": ["static studio backdrop"], "creativeBoldness": 0.84, "noveltyPreference": 0.85, "repetitionTolerance": 0.14},
}
seed_initiative = {"char-nova": "CREATIVE", "char-iona": "REACTIVE", "char-mara": "DIRECTOR"}

connection.execute("BEGIN IMMEDIATE")
try:
    for media_id in fixture_ids:
        for table in ("characterReferenceMeta", "characterReferences", "collectionItems", "jobReferences", "proposalReferences", "messageAttachments", "notes", "mediaReactions"):
            connection.execute(f"DELETE FROM {table} WHERE mediaId=?", (media_id,))
    # Preserve real generated jobs/proposals while removing only their associations to deleted fixture inputs.
    for row in connection.execute("SELECT id,settingsJson FROM jobs").fetchall():
        try:
            value = json.loads(row["settingsJson"] or "{}")
            if isinstance(value.get("referenceAssetIds"), list):
                value["referenceAssetIds"] = [item for item in value["referenceAssetIds"] if item not in fixture_ids]
            if isinstance(value.get("referenceAssetRoles"), dict):
                value["referenceAssetRoles"] = {key: role for key, role in value["referenceAssetRoles"].items() if key not in fixture_ids}
            connection.execute("UPDATE jobs SET settingsJson=? WHERE id=?", (json.dumps(value), row["id"]))
        except (ValueError, TypeError):
            pass
    for row in connection.execute("SELECT id,suggestedReferenceIdsJson,suggestedReferenceRolesJson FROM sceneProposals").fetchall():
        try:
            ids = [item for item in json.loads(row["suggestedReferenceIdsJson"] or "[]") if item not in fixture_ids]
            roles = {key: role for key, role in json.loads(row["suggestedReferenceRolesJson"] or "{}").items() if key not in fixture_ids}
            connection.execute("UPDATE sceneProposals SET suggestedReferenceIdsJson=?,suggestedReferenceRolesJson=? WHERE id=?", (json.dumps(ids), json.dumps(roles), row["id"]))
        except (ValueError, TypeError):
            pass
    for row in connection.execute("SELECT characterId,payloadJson FROM creativeMemories").fetchall():
        try:
            value = json.loads(row["payloadJson"] or "{}")
            for key in ("recentSceneIds", "favoriteMediaIds"):
                if isinstance(value.get(key), list): value[key] = [item for item in value[key] if item not in fixture_ids]
            if isinstance(value.get("recentScenes"), list): value["recentScenes"] = [item for item in value["recentScenes"] if item.get("mediaId") not in fixture_ids]
            if isinstance(value.get("recentReferencePacks"), list): value["recentReferencePacks"] = [[item for item in pack if item not in fixture_ids] for pack in value["recentReferencePacks"]]
            for key in ("acceptedProposalIds", "savedProposalIds", "rejectedProposalIds", "remixedProposalIds", "generatedProposalIds"):
                if not isinstance(value.get(key), list): value[key] = []
            connection.execute("UPDATE creativeMemories SET payloadJson=? WHERE characterId=?", (json.dumps(value), row["characterId"]))
        except (ValueError, TypeError):
            pass
    for character_id, name in seed_names.items():
        deleted = connection.execute("DELETE FROM messages WHERE conversationId=? AND ((role='character' AND body LIKE ?) OR (role='user' AND body LIKE ?))", (f"conv-{character_id}", f"{name}: %been thinking about our next scene.", "%keep the lighting cinematic and intimate.%"))
        report["seedMessagesRemoved"] += deleted.rowcount
    connection.execute("DELETE FROM media WHERE providerId LIKE 'fixture-%' OR url LIKE '/fixtures/scene-%'")
    for portrait_id in portrait_ids:
        connection.execute("UPDATE characters SET portraitUrl='' WHERE id=?", (portrait_id,))
    for character_id, values in seed_identity.items():
        for field, seeded_value in values.items():
            changed = connection.execute(f"UPDATE characters SET {field}='' WHERE id=? AND {field}=?", (character_id, seeded_value))
            report["seedIdentityFieldsCleared"] += changed.rowcount
    # Remove only exact shared copy inserted by the old fixture profile initializer.
    for row in connection.execute("SELECT characterId,initiativeLevel,adultCharacter,ageVerifiedAdult,conversationalProfileJson,creativeProfileJson FROM characterBrainProfiles WHERE characterId IN ('char-nova','char-iona','char-mara')").fetchall():
        profile = json.loads(row["conversationalProfileJson"] or "{}")
        for field, seeded_value, empty_value in (
            ("lore", "A fictional adult creator developing a personal visual portfolio.", ""),
            ("relationshipNotes", "Treat the user as a trusted creative collaborator.", ""),
            ("boundaries", ["Keep scene planning collaborative and fictional."], []),
        ):
            if profile.get(field) == seeded_value:
                profile[field] = empty_value
                report["seedBrainFieldsCleared"] += 1
        for field, seeded_value in seed_conversation_fields[row["characterId"]].items():
            if profile.get(field) == seeded_value:
                profile[field] = [] if isinstance(seeded_value, list) else "" if isinstance(seeded_value, str) else 0
                report["seedBrainFieldsCleared"] += 1
        creative = json.loads(row["creativeProfileJson"] or "{}")
        for field, seeded_value in seed_creative_fields[row["characterId"]].items():
            if creative.get(field) == seeded_value:
                creative[field] = [] if isinstance(seeded_value, list) else "" if isinstance(seeded_value, str) else 0
                report["seedBrainFieldsCleared"] += 1
        initiative = "REACTIVE" if row["initiativeLevel"] == seed_initiative[row["characterId"]] else row["initiativeLevel"]
        adult = 0 if row["adultCharacter"] == 1 and row["ageVerifiedAdult"] == 0 else row["adultCharacter"]
        if initiative != row["initiativeLevel"]: report["seedBrainFieldsCleared"] += 1
        if adult != row["adultCharacter"]: report["seedBrainFieldsCleared"] += 1
        connection.execute("UPDATE characterBrainProfiles SET initiativeLevel=?,adultCharacter=?,conversationalProfileJson=?,creativeProfileJson=? WHERE characterId=?", (initiative, adult, json.dumps(profile), json.dumps(creative), row["characterId"]))
    # Histories are mixed with user activity. Clear a seed value only when that individual
    # history field still consists solely of the exact value introduced by startup.
    for row in connection.execute("SELECT characterId,payloadJson FROM creativeMemories WHERE characterId IN ('char-nova','char-iona','char-mara')").fetchall():
        payload = json.loads(row["payloadJson"] or "{}")
        for field, seeded_value in seed_memory_fields[row["characterId"]].items():
            if payload.get(field) == [seeded_value]:
                payload[field] = []
                report["seedMemoryFieldsCleared"] += 1
        connection.execute("UPDATE creativeMemories SET payloadJson=? WHERE characterId=?", (json.dumps(payload), row["characterId"]))
    collection = connection.execute("SELECT mediaId FROM collectionItems WHERE collectionId='collection-night-studies'").fetchall()
    if all(row[0] in fixture_ids for row in collection):
        known_collection = connection.execute("SELECT 1 FROM collections WHERE id='collection-night-studies' AND name='Night Studies'").fetchone()
        if known_collection:
            connection.execute("DELETE FROM collectionItems WHERE collectionId='collection-night-studies'")
            connection.execute("DELETE FROM collections WHERE id='collection-night-studies'")
            report["nightStudiesRemoved"] = 1
    report["characterRecordsPreserved"] = connection.execute("SELECT COUNT(*) FROM characters WHERE id IN ('char-nova','char-iona','char-mara')").fetchone()[0]
    connection.commit()
except Exception:
    connection.rollback()
    raise
finally:
    connection.close()

# Remove only known generated fixture files whose URL was inside public/fixtures.
repo_root = Path(__file__).resolve().parents[1]
fixtures_root = (repo_root / "public" / "fixtures").resolve()
for url in fixture_url_paths:
    candidate = (repo_root / "public" / url.lstrip("/")).resolve()
    if candidate.parent == fixtures_root and candidate.is_file(): candidate.unlink()
# The remaining public fixtures are the known seeded/demo portraits and story avatars.
for candidate in fixtures_root.glob("char-*-portrait.svg"):
    if candidate.is_file(): candidate.unlink()
for candidate in fixtures_root.glob("story-avatar-*.svg"):
    if candidate.is_file(): candidate.unlink()
for candidate in fixtures_root.glob("scene-*.svg"):
    if candidate.is_file(): candidate.unlink()
print(json.dumps(report, indent=2))
