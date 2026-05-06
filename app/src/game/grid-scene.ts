import Phaser from "phaser";
import { createBoard } from "./board";
import { Components, type RenderState } from "./components/index";
import { createHoverEntity, createPlayerEntity } from "./entities/index";
import { World } from "./ecs";
import { GAME_HEIGHT, GAME_WIDTH } from "./grid-constants";
import { pointerToGrid } from "./grid-math";
import { installGridResources, type GridInput } from "./resources";
import { gridSystems } from "./systems/index";
import type {
  EnergyState,
  ActiveActionState,
  GameClient,
  GridPoint,
  PlayerActionState,
} from "./types";

export { GAME_HEIGHT, GAME_WIDTH };

export const createGridScene = (client: GameClient) =>
  class GridScene extends Phaser.Scene {
    private world!: World;
    private unsubscribePlayerActionState: (() => void) | null = null;

    constructor() {
      super("grid-scene");
    }

    create() {
      this.cameras.main.setBackgroundColor("#f6f2e8");
      this.world = new World();

      installGridResources(this.world, this, client);
      createBoard(this);
      createHoverEntity(this.world, this);
      const player = createPlayerEntity(this.world, this, { x: 10, y: 10 });
      this.bindPlayerActionState(player);

      for (const system of gridSystems) {
        this.world.addSystem(system);
      }

      this.world.update(0);
      this.bindPointerInput();
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.unsubscribePlayerActionState?.();
        this.unsubscribePlayerActionState = null;
      });
    }

    update(_time: number, delta: number) {
      this.world.update(delta);
    }

    private bindPointerInput() {
      this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
        this.gridInput.hoverPoint = pointerToGrid(pointer);
      });

      this.input.on("pointerout", () => {
        this.gridInput.hoverPoint = null;
      });

      this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        this.gridInput.requestedMove = pointerToGrid(pointer);
      });
    }

    private get gridInput() {
      return this.world.requireResource<GridInput>("input");
    }

    private bindPlayerActionState(player: number) {
      this.unsubscribePlayerActionState =
        client.subscribePlayerActionState?.((state) =>
          this.applyPlayerActionState(player, state)
        ) ?? null;
    }

    private applyPlayerActionState(player: number, state: PlayerActionState) {
      const position = this.world.requireComponent<GridPoint>(
        player,
        Components.position
      );
      const energy = this.world.requireComponent<EnergyState>(
        player,
        Components.energy
      );
      const activeAction = this.world.requireComponent<ActiveActionState>(
        player,
        Components.activeAction
      );
      const renderState = this.world.requireComponent<RenderState>(
        player,
        Components.renderState
      );

      position.x = state.position.x;
      position.y = state.position.y;
      energy.current = state.energy.current;
      energy.max = state.energy.max;
      activeAction.action = state.activeAction.action;
      activeAction.kind = state.activeAction.kind;
      activeAction.startedAt = state.activeAction.startedAt;
      activeAction.endsAt = state.activeAction.endsAt;
      renderState.dirty = true;
    }
  };
