import Phaser from "phaser";
import "./styles.css";

const GRID_SIZE = 20;
const CELL_SIZE = 32;
const GRID_PIXELS = GRID_SIZE * CELL_SIZE;
const GAME_WIDTH = 720;
const GAME_HEIGHT = 760;
const GRID_ORIGIN_X = (GAME_WIDTH - GRID_PIXELS) / 2;
const GRID_ORIGIN_Y = 84;

type GridPoint = {
  x: number;
  y: number;
};

class GridScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private hover!: Phaser.GameObjects.Rectangle;
  private playerPosition: GridPoint = { x: 10, y: 10 };
  private positionLabel: HTMLElement | null = null;

  constructor() {
    super("grid-scene");
  }

  create() {
    this.positionLabel = document.getElementById("player-position");

    this.cameras.main.setBackgroundColor("#f6f2e8");
    this.drawBoard();

    this.hover = this.add
      .rectangle(0, 0, CELL_SIZE - 3, CELL_SIZE - 3, 0x7cc9aa, 0.2)
      .setStrokeStyle(2, 0x2f806a, 0.45)
      .setOrigin(0)
      .setVisible(false);

    this.player = this.add
      .rectangle(0, 0, CELL_SIZE - 8, CELL_SIZE - 8, 0xe24a55)
      .setStrokeStyle(3, 0x84242b)
      .setOrigin(0);

    this.placePlayer(this.playerPosition, false);
    this.updatePositionLabel();

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      const point = this.pointerToGrid(pointer);

      if (!point) {
        this.hover.setVisible(false);
        return;
      }

      const world = this.gridToWorld(point);
      this.hover.setPosition(world.x + 1.5, world.y + 1.5).setVisible(true);
    });

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      const point = this.pointerToGrid(pointer);

      if (!point) {
        return;
      }

      this.playerPosition = point;
      this.placePlayer(point, true);
      this.updatePositionLabel();
    });
  }

  private drawBoard() {
    const board = this.add.graphics();

    board.fillStyle(0xffffff, 1);
    board.fillRoundedRect(
      GRID_ORIGIN_X - 10,
      GRID_ORIGIN_Y - 10,
      GRID_PIXELS + 20,
      GRID_PIXELS + 20,
      8
    );

    board.fillStyle(0xd9eadc, 1);
    board.fillRect(GRID_ORIGIN_X, GRID_ORIGIN_Y, GRID_PIXELS, GRID_PIXELS);

    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        const color = (x + y) % 2 === 0 ? 0xecf6ee : 0xe2f0e5;
        board.fillStyle(color, 1);
        board.fillRect(
          GRID_ORIGIN_X + x * CELL_SIZE,
          GRID_ORIGIN_Y + y * CELL_SIZE,
          CELL_SIZE,
          CELL_SIZE
        );
      }
    }

    board.lineStyle(1, 0x91aa96, 0.72);

    for (let index = 0; index <= GRID_SIZE; index += 1) {
      const lineOffset = index * CELL_SIZE;
      board.lineBetween(
        GRID_ORIGIN_X + lineOffset,
        GRID_ORIGIN_Y,
        GRID_ORIGIN_X + lineOffset,
        GRID_ORIGIN_Y + GRID_PIXELS
      );
      board.lineBetween(
        GRID_ORIGIN_X,
        GRID_ORIGIN_Y + lineOffset,
        GRID_ORIGIN_X + GRID_PIXELS,
        GRID_ORIGIN_Y + lineOffset
      );
    }
  }

  private placePlayer(point: GridPoint, animate: boolean) {
    const world = this.gridToWorld(point);
    const x = world.x + 4;
    const y = world.y + 4;

    if (!animate) {
      this.player.setPosition(x, y);
      return;
    }

    this.tweens.killTweensOf(this.player);
    this.tweens.add({
      targets: this.player,
      x,
      y,
      duration: 180,
      ease: "Quad.easeOut",
    });
  }

  private gridToWorld(point: GridPoint) {
    return {
      x: GRID_ORIGIN_X + point.x * CELL_SIZE,
      y: GRID_ORIGIN_Y + point.y * CELL_SIZE,
    };
  }

  private pointerToGrid(pointer: Phaser.Input.Pointer): GridPoint | null {
    const x = Math.floor((pointer.x - GRID_ORIGIN_X) / CELL_SIZE);
    const y = Math.floor((pointer.y - GRID_ORIGIN_Y) / CELL_SIZE);

    if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) {
      return null;
    }

    return { x, y };
  }

  private updatePositionLabel() {
    if (!this.positionLabel) {
      return;
    }

    this.positionLabel.textContent = `Player: ${this.playerPosition.x}, ${this.playerPosition.y}`;
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: "#f6f2e8",
  scene: GridScene,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});
