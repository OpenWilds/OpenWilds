/**
 * MagicBlock backend factory.
 *
 * This orchestrator wires the MagicBlock-specific services into the generic
 * game backend composition function. The important boundary is that Phaser only
 * receives `backend.client`, while future runtime mixes can swap any of
 * `read`, `write`, or `session` without changing scene code.
 */
import type { HudController } from "../hud";
import { createGameBackend, type GameBackend } from "../../game/ports";
import { MagicBlockClientCore } from "./client-core";
import { MagicBlockReadAdapter } from "./read-adapter";
import { MagicBlockSessionAdapter } from "./session-adapter";
import { MagicBlockWriteAdapter } from "./write-adapter";

/** Creates the current MagicBlock-only backend implementation. */
export const createMagicBlockGameBackend = (
  hud: HudController
): GameBackend => {
  const core = new MagicBlockClientCore(hud);
  const read = new MagicBlockReadAdapter(core.readService);
  const write = new MagicBlockWriteAdapter(core.writeService);
  const session = new MagicBlockSessionAdapter(core.sessionService);

  return createGameBackend({
    read,
    write,
    session,
    state: core.state,
    dispose: () => core.dispose(),
  });
};
