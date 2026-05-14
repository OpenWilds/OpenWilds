# Studio Domain

Studio owns design-time creator data: maps, generated terrain, sprite assets,
and media generation workflows. The existing `convex/studio.ts` module remains
the public compatibility surface for now; future splits should keep old
function refs alive until the frontend is migrated.
