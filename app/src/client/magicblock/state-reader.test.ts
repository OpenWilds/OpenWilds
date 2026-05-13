import { describe, expect, it } from "vitest";
import {
  decodeActiveAction,
  decodeEnergy,
  decodeInventory,
  decodePosition,
  decodeTileItem,
  selectFreshestPlayerActionState,
} from "./state-reader";
import type { PlayerActionState } from "../../game/types";

const accountData = (length: number) => new Uint8Array(length);

const writeI64 = (data: Uint8Array, offset: number, value: number) => {
  const view = new DataView(data.buffer);
  view.setBigInt64(offset, BigInt(value), true);
};

const writeU64 = (data: Uint8Array, offset: number, value: number) => {
  const view = new DataView(data.buffer);
  view.setBigUint64(offset, BigInt(value), true);
};

const playerState = (startedAt: number, endsAt: number): PlayerActionState => ({
  position: { x: 0, y: 0 },
  energy: { current: 1, max: 1 },
  activeAction: {
    action: 1,
    kind: "move",
    startedAt,
    endsAt,
  },
});

describe("MagicBlock state reader", () => {
  it("decodes player action component data", () => {
    const position = accountData(24);
    const energy = accountData(24);
    const action = accountData(25);

    writeI64(position, 8, 4);
    writeI64(position, 16, -2);
    writeU64(energy, 8, 8);
    writeU64(energy, 16, 10);
    action[8] = 1;
    writeI64(action, 9, 100);
    writeI64(action, 17, 200);

    expect(decodePosition(position)).toEqual({ x: 4, y: -2 });
    expect(decodeEnergy(energy)).toEqual({ current: 8, max: 10 });
    expect(decodeActiveAction(action, 150)).toEqual({
      action: 1,
      kind: "move",
      startedAt: 100,
      endsAt: 200,
    });
  });

  it("decodes sparse inventory slots and tile items", () => {
    const inventory = accountData(72);
    const inventoryView = new DataView(inventory.buffer);
    inventoryView.setUint16(8, 3, true);
    inventoryView.setUint16(40, 5, true);
    inventoryView.setUint16(10, 4, true);
    inventoryView.setUint16(42, 0, true);

    const tileItem = accountData(28);
    writeI64(tileItem, 8, 6);
    writeI64(tileItem, 16, 7);
    new DataView(tileItem.buffer).setUint16(24, 9, true);
    new DataView(tileItem.buffer).setUint16(26, 2, true);

    expect(decodeInventory(inventory)).toEqual({
      slots: [{ itemId: 3, quantity: 5 }],
    });
    expect(decodeTileItem(tileItem, { x: 0, y: 0 })).toEqual({
      x: 6,
      y: 7,
      itemId: 9,
      quantity: 2,
    });
  });

  it("selects the freshest base or ER state by action revision", () => {
    const er = { source: "er" as const, state: playerState(10, 20) };
    const base = { source: "base" as const, state: playerState(11, 21) };

    expect(selectFreshestPlayerActionState(er, base)).toBe(base);
    expect(selectFreshestPlayerActionState(er, null)).toBe(er);
    expect(selectFreshestPlayerActionState(null, base)).toBe(base);
  });
});
