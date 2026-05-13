import { describe, expect, it } from "vitest";
import { createInMemoryGameBackend } from "./in-memory-adapter";
import type { GameBackend } from "../ports";
import type { FarmTileState, TileItemState } from "../types";

const describeGameAdapterContract = (
  label: string,
  createBackend: () => GameBackend
) => {
  describe(`${label} game adapter contract`, () => {
    it("emits initial cached state to subscribers", () => {
      const backend = createBackend();
      const playerStates: string[] = [];
      const inventoryCounts: number[] = [];

      const unsubscribePlayer = backend.read.subscribePlayerActionState(
        (state) => playerStates.push(`${state.position.x},${state.position.y}`)
      );
      const unsubscribeInventory = backend.read.subscribeInventory(
        (inventory) => inventoryCounts.push(inventory.slots.length)
      );

      expect(playerStates).toEqual(["0,0"]);
      expect(inventoryCounts).toEqual([0]);

      unsubscribePlayer();
      unsubscribeInventory();
      backend.dispose();
    });

    it("moves and sleeps through the write adapter and notifies reads", async () => {
      const backend = createBackend();
      const playerStates: string[] = [];
      backend.read.subscribePlayerActionState((state) =>
        playerStates.push(
          `${state.position.x},${state.position.y}:${state.activeAction.kind}`
        )
      );

      const moved = await backend.write.movePlayer({ x: 2, y: 3 });
      const slept = await backend.write.sleepPlayer();

      expect(moved?.position).toEqual({ x: 2, y: 3 });
      expect(moved?.activeAction.kind).toBe("move");
      expect(slept?.energy.current).toBe(slept?.energy.max);
      expect(playerStates).toContain("2,3:move");
      expect(playerStates).toContain("2,3:sleep");

      backend.dispose();
    });

    it("updates farm tiles and tile items through tile actions", async () => {
      const backend = createBackend();
      const farmSnapshots: FarmTileState[][] = [];
      const itemSnapshots: TileItemState[][] = [];
      backend.read.subscribeFarmTiles((tiles) => farmSnapshots.push(tiles));
      backend.read.subscribeTileItems((items) => itemSnapshots.push(items));

      const tilled = await backend.write.performAction("till", {
        x: 1,
        y: 1,
      });
      const dropped = await backend.write.performAction(
        "drop",
        { x: 1, y: 1 },
        7,
        2
      );
      const grabbed = await backend.write.performAction("grab", {
        x: 1,
        y: 1,
      });

      expect(tilled?.tile?.soilState).toBe("tilled");
      expect(dropped?.item).toMatchObject({
        x: 1,
        y: 1,
        itemId: 7,
        quantity: 2,
      });
      expect(grabbed?.item).toBeNull();
      expect(farmSnapshots[farmSnapshots.length - 1]?.[0].soilState).toBe(
        "tilled"
      );
      expect(itemSnapshots[itemSnapshots.length - 1]).toEqual([]);

      backend.dispose();
    });

    it("satisfies the trade write contract", async () => {
      const backend = createBackend();
      const tradeCounts: number[] = [];
      backend.read.subscribeTradeOffers((offers) =>
        tradeCounts.push(offers.length)
      );

      await backend.write.createTradeOffer({
        sellerMint: "seller-player",
        itemId: 4,
        itemQuantity: 2,
        goldAmount: 10,
      });
      await backend.write.acceptTradeOffer("offer-1");
      await backend.write.finalizeTradeOffer("offer-1");
      await backend.write.cancelTradeOffer("offer-1");

      expect(tradeCounts).toEqual([0, 1, 1, 1, 0]);
      backend.dispose();
    });
  });
};

describeGameAdapterContract("in-memory", () => createInMemoryGameBackend());
