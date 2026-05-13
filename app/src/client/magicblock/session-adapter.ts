/**
 * MagicBlock session adapter wrapper.
 *
 * Exposes selected-player streams and session commands through the public
 * `GameSessionAdapter`. Backend factories can replace this with a different
 * session runtime without touching Phaser or read/write adapters.
 */
import type { GameSessionAdapter } from "../../game/ports";

/** Exposes MagicBlock session behavior through the backend-neutral session port. */
export class MagicBlockSessionAdapter implements GameSessionAdapter {
  readonly selectedPlayer$: GameSessionAdapter["selectedPlayer$"];

  /** Receives the already-composed MagicBlock session service. */
  constructor(private readonly service: GameSessionAdapter) {
    this.selectedPlayer$ = service.selectedPlayer$;
  }

  boot: GameSessionAdapter["boot"] = () => this.service.boot();

  hasSelectedPlayer: GameSessionAdapter["hasSelectedPlayer"] = () =>
    this.service.hasSelectedPlayer();

  prepareSelectedPlayer: GameSessionAdapter["prepareSelectedPlayer"] = () =>
    this.service.prepareSelectedPlayer();
}
