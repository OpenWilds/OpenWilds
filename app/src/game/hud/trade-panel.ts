import Phaser from "phaser";
import { UI_ASSETS } from "../../assets/ui-assets";
import { getFarmItemLabel } from "../farm";
import type {
  GoldBalanceState,
  GridPoint,
  TradeOfferState,
  VisiblePlayerState,
} from "../types";
import { makeHudText, short } from "./text";
import type { TradeCallbacks } from "./types";

export const createTradePanel = (
  scene: Phaser.Scene,
  args: {
    callbacks: TradeCallbacks;
    getSelectedItemId: () => number | null;
    getSelectedQuantity: () => number;
  }
) => {
  const container = scene.add.container(18, 0).setScrollFactor(0);
  const bg = scene.add
    .image(0, 0, UI_ASSETS.toastCardPanel.key)
    .setOrigin(0)
    .setDisplaySize(430, 108)
    .setAlpha(0.95);
  const title = makeHudText(scene, 24, 16, "Trade", 15, "#f6efd7", 76);
  const goldText = makeHudText(scene, 98, 17, "Gold 0", 13, "#f1d38b", 120);
  const bodyText = makeHudText(
    scene,
    24,
    44,
    "No nearby trader",
    11,
    "#dce8e2",
    360
  );
  let localPosition: GridPoint | null = null;
  let players: VisiblePlayerState[] = [];
  let offers: TradeOfferState[] = [];
  let gold: GoldBalanceState = { amount: 0n };
  let selectedSellerMint: string | null = null;

  container.add([bg, title, goldText, bodyText]);
  container
    .setSize(430, 108)
    .setInteractive(
      new Phaser.Geom.Rectangle(0, 0, 430, 108),
      Phaser.Geom.Rectangle.Contains
    )
    .on(
      "pointerdown",
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData
      ) => {
        event.stopPropagation();
        runPrimaryTradeAction();
      }
    );

  return {
    container,
    width: 430,
    height: 108,
    updateGoldBalance(balance: GoldBalanceState) {
      gold = balance;
      render();
    },
    updateLocalPosition(position: GridPoint) {
      localPosition = position;
      render();
    },
    updateVisiblePlayers(nextPlayers: VisiblePlayerState[]) {
      players = nextPlayers;
      render();
    },
    updateTradeOffers(nextOffers: TradeOfferState[]) {
      offers = nextOffers;
      render();
    },
    selectSeller(mint: string) {
      selectedSellerMint = mint;
      render();
    },
  };

  function render() {
    goldText.setText(`Gold ${gold.amount.toString()}`);
    const nearby = getNearbyPlayers();

    if (
      selectedSellerMint &&
      !nearby.some(({ player }) => player.mint === selectedSellerMint)
    ) {
      selectedSellerMint = null;
    }

    const selectedSeller = nearby.find(
      ({ player }) => player.mint === selectedSellerMint
    )?.player;
    const selectedItemId = args.getSelectedItemId();
    const openOffer = offers.find((offer) => offer.status !== "finalized");

    if (selectedSeller && selectedItemId) {
      bodyText.setText(
        `Ready: ${getFarmItemLabel(
          selectedItemId
        )} x${args.getSelectedQuantity()} with ${short(selectedSeller.mint)}`
      );
      return;
    }

    if (selectedSeller) {
      bodyText.setText(
        `Nearby trader ${short(selectedSeller.mint)}. Select an item.`
      );
      return;
    }

    if (openOffer) {
      bodyText.setText(
        `${openOffer.direction}: ${getFarmItemLabel(openOffer.itemId)} x${
          openOffer.itemQuantity
        } for ${openOffer.goldAmount.toString()}G`
      );
      return;
    }

    bodyText.setText(
      nearby.length ? "Select a nearby trader" : "No nearby trader"
    );
  }

  function getNearbyPlayers() {
    return players
      .filter((player) => !player.isActive)
      .map((player) => ({
        player,
        distance: localPosition
          ? Math.max(
              Math.abs(localPosition.x - player.state.position.x),
              Math.abs(localPosition.y - player.state.position.y)
            )
          : Number.POSITIVE_INFINITY,
      }))
      .filter((entry) => entry.distance <= 1)
      .sort((left, right) => left.distance - right.distance);
  }

  function runPrimaryTradeAction() {
    const selectedSeller = players.find(
      (player) => player.mint === selectedSellerMint
    );
    const selectedItemId = args.getSelectedItemId();
    const offer = offers.find((candidate) => candidate.status !== "finalized");

    if (selectedSeller && selectedItemId) {
      void args.callbacks.createOffer({
        sellerMint: selectedSeller.mint,
        itemId: selectedItemId,
        itemQuantity: args.getSelectedQuantity(),
        goldAmount: 1,
      });
      return;
    }

    if (offer?.direction === "incoming" && offer.status === "open") {
      void args.callbacks.acceptOffer(offer.offer);
      return;
    }

    if (offer?.direction === "outgoing" && offer.status === "accepted") {
      void args.callbacks.finalizeOffer(offer.offer);
      return;
    }

    if (offer?.direction === "outgoing" && offer.status === "open") {
      void args.callbacks.cancelOffer(offer.offer);
    }
  }
};
