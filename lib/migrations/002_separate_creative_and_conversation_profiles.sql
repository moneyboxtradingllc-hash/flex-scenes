UPDATE characterBrainProfiles
SET creativeProfileJson = CASE
  WHEN json_valid(creativeProfileJson) THEN json_remove(
    creativeProfileJson,
    '$.speakingStyle', '$.vocabulary', '$.humorStyle',
    '$.emotionalExpressiveness', '$.attitude', '$.boundaries',
    '$.lore', '$.relationshipNotes'
  )
  ELSE '{}'
END;
