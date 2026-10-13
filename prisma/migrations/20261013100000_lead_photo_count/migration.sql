-- Photos on the Google listing, from place details; backfilled from stored details snapshots.
ALTER TABLE "Lead" ADD COLUMN "photoCount" INTEGER NOT NULL DEFAULT 0;
UPDATE "Lead" l SET "photoCount" = s.n FROM (SELECT DISTINCT ON ("placeId") "placeId", COALESCE(jsonb_array_length(raw->'photos'), 0) AS n FROM "PlaceSnapshot" WHERE kind = 'details' AND jsonb_typeof(raw->'photos') = 'array' ORDER BY "placeId", "fetchedAt" DESC) s WHERE s."placeId" = l."placeId";
