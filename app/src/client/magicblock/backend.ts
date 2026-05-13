import type { HudController } from "../hud";
import { createGameClient, type GameBackend } from "../../game/ports";
import { MagicBlockClientCore } from "./client-core";
import { MagicBlockReadAdapter } from "./read-adapter";
import { MagicBlockSessionAdapter } from "./session-adapter";
import { MagicBlockWriteAdapter } from "./write-adapter";

export const createMagicBlockGameBackend = (
  hud: HudController
): GameBackend => {
  const core = new MagicBlockClientCore(hud);
  const read = new MagicBlockReadAdapter(core);
  const write = new MagicBlockWriteAdapter(core);
  const session = new MagicBlockSessionAdapter(core);

  return {
    read,
    write,
    session,
    client: createGameClient(read, write),
    dispose: () => core.dispose(),
  };
};
