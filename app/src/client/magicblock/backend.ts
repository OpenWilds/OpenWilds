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
import { GameStateStore } from "../../game/state-store";
import { MagicBlockAgentSessionService } from "./agent-session-service";
import { MagicBlockControlBinder } from "./control-binder";
import { MagicBlockNativeClientCore } from "./native-client-core";
import { MagicBlockReadAdapter } from "./read-adapter";
import { MagicBlockReadService } from "./read-service";
import { MagicBlockSessionAdapter } from "./session-adapter";
import { MagicBlockSessionService } from "./session-service";
import { MagicBlockWriteAdapter } from "./write-adapter";
import { MagicBlockWriteService } from "./write-service";

/** Creates the current MagicBlock-only backend implementation. */
export const createMagicBlockGameBackend = (
  hud: HudController
): GameBackend => {
  const state = new GameStateStore();
  const core = new MagicBlockNativeClientCore(hud);
  const agentSessionService = new MagicBlockAgentSessionService(core);
  const controls = new MagicBlockControlBinder(hud, core, agentSessionService);
  const readService = new MagicBlockReadService(core, state);
  const writeService = new MagicBlockWriteService(core);
  const sessionService = new MagicBlockSessionService(core, state);
  const read = new MagicBlockReadAdapter(readService);
  const write = new MagicBlockWriteAdapter(writeService);
  const session = new MagicBlockSessionAdapter(sessionService);
  controls.bind();

  return createGameBackend({
    read,
    write,
    session,
    state,
    dispose: () => {
      controls.dispose();
      readService.dispose();
      sessionService.dispose();
      core.dispose();
      state.dispose();
    },
  });
};
