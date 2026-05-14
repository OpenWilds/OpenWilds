import { authTables } from "@convex-dev/auth/server";
import { defineSchema } from "convex/server";
import { gameTables } from "./schema/game";
import { indexerTables } from "./schema/indexers";
import { studioTables } from "./schema/studio";

export default defineSchema({
  ...authTables,
  ...studioTables,
  ...gameTables,
  ...indexerTables,
});
