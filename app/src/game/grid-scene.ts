import Phaser from "phaser";
import { createBoard } from "./board";
import { createHoverEntity, createPlayerEntity } from "./entities/index";
import { World } from "./ecs";
import { GAME_HEIGHT, GAME_WIDTH } from "./grid-constants";
import { pointerToGrid } from "./grid-math";
import { installGridResources, type GridInput } from "./resources";
import { beginActionTransition } from "./systems/action-transition";
import { gridSystems } from "./systems/index";
import { Components, type RectComponent } from "./components/index";
import type {
  GameClient,
  PlayerActionState,
  PlayerAppearance,
  VisiblePlayerState,
} from "./types";

export { GAME_HEIGHT, GAME_WIDTH };

export const createGridScene = (client: GameClient) =>
  class GridScene extends Phaser.Scene {
    private world!: World;
    private unsubscribePlayerActionState: (() => void) | null = null;
    private unsubscribePlayerAppearance: (() => void) | null = null;
    private unsubscribeVisiblePlayers: (() => void) | null = null;
    private activePlayerEntity: number | null = null;
    private readonly remotePlayerEntities = new Map<string, number>();
    private readonly remotePlayerStateKeys = new Map<string, string>();

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
      this.activePlayerEntity = player;
      this.bindPlayerActionState(player);

      for (const system of gridSystems) {
        this.world.addSystem(system);
      }

      this.world.update(0);
      this.bindPointerInput();
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.unsubscribePlayerActionState?.();
        this.unsubscribePlayerActionState = null;
        this.unsubscribePlayerAppearance?.();
        this.unsubscribePlayerAppearance = null;
        this.unsubscribeVisiblePlayers?.();
        this.unsubscribeVisiblePlayers = null;
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
      this.unsubscribePlayerAppearance =
        client.subscribePlayerAppearance?.((appearance) =>
          this.applyPlayerAppearance(player, appearance)
        ) ?? null;
      this.unsubscribeVisiblePlayers =
        client.subscribeVisiblePlayers?.((players) =>
          this.applyVisiblePlayers(players)
        ) ?? null;
    }

    private applyPlayerActionState(player: number, state: PlayerActionState) {
      beginActionTransition(this.world, player, state);
    }

    private applyPlayerAppearance(
      player: number,
      appearance: PlayerAppearance
    ) {
      const rectangle = this.world.getComponent<RectComponent>(
        player,
        Components.rectangle
      );

      rectangle?.object
        .setFillStyle(appearance.fill)
        .setStrokeStyle(3, appearance.stroke);
    }

    private applyVisiblePlayers(players: VisiblePlayerState[]) {
      const visibleRemoteMints = new Set<string>();

      for (const player of players) {
        if (player.isActive) {
          continue;
        }

        visibleRemoteMints.add(player.mint);
        const entity =
          this.remotePlayerEntities.get(player.mint) ??
          this.createRemotePlayerEntity(player);
        const stateKey = this.getPlayerStateKey(player.state);

        this.applyPlayerAppearance(entity, player.appearance);
        if (this.remotePlayerStateKeys.get(player.mint) === stateKey) {
          continue;
        }

        this.remotePlayerStateKeys.set(player.mint, stateKey);
        beginActionTransition(this.world, entity, player.state);
      }

      for (const [mint, entity] of this.remotePlayerEntities) {
        if (visibleRemoteMints.has(mint)) {
          continue;
        }

        this.world
          .getComponent<RectComponent>(entity, Components.rectangle)
          ?.object.setVisible(false);
        this.remotePlayerEntities.delete(mint);
        this.remotePlayerStateKeys.delete(mint);
      }
    }

    private createRemotePlayerEntity(player: VisiblePlayerState) {
      const entity = createPlayerEntity(
        this.world,
        this,
        player.state.position,
        player.appearance,
        false
      );
      this.world
        .requireComponent<RectComponent>(entity, Components.rectangle)
        .object.setAlpha(0.72);
      this.remotePlayerEntities.set(player.mint, entity);
      return entity;
    }

    private getPlayerStateKey(state: PlayerActionState) {
      return [
        state.position.x,
        state.position.y,
        state.energy.current,
        state.energy.max,
        state.activeAction.action,
        state.activeAction.kind,
        state.activeAction.startedAt,
        state.activeAction.endsAt,
      ].join(":");
    }
  };
