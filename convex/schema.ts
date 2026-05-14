import { authTables } from "@convex-dev/auth/server";
import { defineSchema } from "convex/server";
import { gameTables } from "./schema/game";
import { indexerTables } from "./schema/indexers";
import { studioTables } from "./schema/studio";
import { workspaceTables } from "./schema/workspaces";

export default defineSchema({
  ...authTables,
  ...workspaceTables,
  ...studioTables,
  ...gameTables,
  ...indexerTables,
});
