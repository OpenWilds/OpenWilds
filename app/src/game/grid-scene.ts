import Phaser from "phaser";
import { createBoard } from "./board";
import { createHoverEntity, createPlayerEntity } from "./entities/index";
import { World } from "./ecs";
import { GAME_HEIGHT, GAME_WIDTH } from "./grid-constants";
import { pointerToGrid } from "./grid-math";
import { installGridResources, type GridInput } from "./resources";
import { beginActionTransition } from "./systems/action-transition";
import { gridSystems } from "./systems/index";
import type { GameClient, PlayerActionState } from "./types";

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
      beginActionTransition(this.world, player, state);
    }
  };
