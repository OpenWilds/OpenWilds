import Phaser from "phaser";
import { getFarmItemLabel } from "./farm";
import type {
  GoldBalanceState,
  GridPoint,
  TradeOfferState,
  VisiblePlayerState,
} from "./types";

type TradeOverlayCallbacks = {
  getSelectedItemId: () => number | null;
  getSelectedQuantity: () => number;
  createOffer: (args: {
    sellerMint: string;
    itemId: number;
    itemQuantity: number;
    goldAmount: number;
  }) => Promise<void>;
  acceptOffer: (offer: string) => Promise<void>;
  cancelOffer: (offer: string) => Promise<void>;
  finalizeOffer: (offer: string) => Promise<void>;
};

type Button = {
  background: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
};

const PANEL_X = 34;
const PANEL_Y = 652;
const PANEL_WIDTH = 642;
const PANEL_HEIGHT = 96;
const DEPTH = 40;

export const createTradeOverlay = (
  scene: Phaser.Scene,
  callbacks: TradeOverlayCallbacks
) => {
  const background = scene.add.graphics().setDepth(DEPTH);
  const title = scene.add
    .text(PANEL_X + 14, PANEL_Y + 10, "Trade", {
      color: "#17211e",
      fontFamily: "Inter, sans-serif",
      fontSize: "14px",
      fontStyle: "700",
    })
    .setDepth(DEPTH + 1);
  const goldText = scene.add
    .text(PANEL_X + 72, PANEL_Y + 10, "Gold 0", {
      color: "#6d4a11",
      fontFamily: "Inter, sans-serif",
      fontSize: "13px",
      fontStyle: "700",
    })
    .setDepth(DEPTH + 1);
  const selectedText = scene.add
    .text(PANEL_X + 14, PANEL_Y + 32, "Select a nearby player", {
      color: "#344a42",
      fixedWidth: 236,
      fontFamily: "Inter, sans-serif",
      fontSize: "10px",
      wordWrap: { width: 236 },
    })
    .setDepth(DEPTH + 1);
  const offerText = scene.add
    .text(PANEL_X + 14, PANEL_Y + 50, "", {
      color: "#17211e",
      fixedWidth: 252,
      fontFamily: "Inter, sans-serif",
      fontSize: "10px",
      fontStyle: "700",
      wordWrap: { width: 252 },
    })
    .setDepth(DEPTH + 1);
  const dynamic: Phaser.GameObjects.GameObject[] = [];
  let gold: GoldBalanceState = { amount: 0n };
  let localPosition: GridPoint | null = null;
  let players: VisiblePlayerState[] = [];
  let offers: TradeOfferState[] = [];
  let selectedSellerMint: string | null = null;
  let goldAmount = 1;
  let itemQuantity = 1;
  let busy = false;
  const dismissedOffers = new Set<string>();

  background.fillStyle(0xf7f1e5, 0.98);
  background.fillRoundedRect(PANEL_X, PANEL_Y, PANEL_WIDTH, PANEL_HEIGHT, 8);
  background.lineStyle(1, 0xc7d8c4, 1);
  background.strokeRoundedRect(PANEL_X, PANEL_Y, PANEL_WIDTH, PANEL_HEIGHT, 8);
  background
    .setInteractive(
      new Phaser.Geom.Rectangle(PANEL_X, PANEL_Y, PANEL_WIDTH, PANEL_HEIGHT),
      Phaser.Geom.Rectangle.Contains
    )
    .on(
      "pointerdown",
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData
      ) => event.stopPropagation()
    );

  const destroyDynamic = () => {
    while (dynamic.length > 0) {
      dynamic.pop()?.destroy();
    }
  };

  const addButton = (
    x: number,
    y: number,
    width: number,
    label: string,
    enabled: boolean,
    onClick: () => void
  ): Button => {
    const button = scene.add.graphics().setDepth(DEPTH + 1);
    const text = scene.add
      .text(x, y + 5, label, {
        color: enabled ? "#17211e" : "#7e8d86",
        fixedWidth: width,
        fontFamily: "Inter, sans-serif",
        fontSize: "10px",
        fontStyle: "700",
        align: "center",
      })
      .setDepth(DEPTH + 2);

    button.fillStyle(enabled ? 0xffe0a3 : 0xe3ded2, 1);
    button.fillRoundedRect(x, y, width, 22, 6);
    button.lineStyle(1, enabled ? 0xa26924 : 0xc7d8c4, 1);
    button.strokeRoundedRect(x, y, width, 22, 6);
    button.setInteractive(
      new Phaser.Geom.Rectangle(x, y, width, 22),
      Phaser.Geom.Rectangle.Contains
    );
    button.on(
      "pointerdown",
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData
      ) => {
        event.stopPropagation();
        if (enabled && !busy) {
          onClick();
        }
      }
    );
    text
      .setInteractive({ useHandCursor: enabled })
      .on(
        "pointerdown",
        (
          _pointer: Phaser.Input.Pointer,
          _localX: number,
          _localY: number,
          event: Phaser.Types.Input.EventData
        ) => {
          event.stopPropagation();
          if (enabled && !busy) {
            onClick();
          }
        }
      );
    dynamic.push(button, text);
    return { background: button, label: text };
  };

  const nearbyPlayers = () =>
    players
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

  const shortMint = (value: string) =>
    `${value.slice(0, 4)}...${value.slice(-4)}`;

  const run = async (action: () => Promise<void>) => {
    if (busy) {
      return;
    }

    busy = true;
    render();
    try {
      await action();
    } finally {
      busy = false;
      render();
    }
  };

  const renderOfferRow = (offer: TradeOfferState, index: number) => {
    const y = PANEL_Y + 28 + index * 24;
    const direction = offer.direction === "incoming" ? "In" : "Out";
    const label = `${direction}: ${getFarmItemLabel(offer.itemId)} x${
      offer.itemQuantity
    } for ${offer.goldAmount.toString()}G`;
    const rowText = scene.add
      .text(PANEL_X + 392, y + 4, label, {
        color: "#17211e",
        fixedWidth: 150,
        fontFamily: "Inter, sans-serif",
        fontSize: "9px",
        fontStyle: "700",
        wordWrap: { width: 150 },
      })
      .setDepth(DEPTH + 1);
    dynamic.push(rowText);

    if (offer.direction === "incoming" && offer.status === "open") {
      addButton(
        PANEL_X + 548,
        y,
        38,
        "Accept",
        true,
        () => void run(() => callbacks.acceptOffer(offer.offer))
      );
      addButton(PANEL_X + 588, y, 36, "No", true, () => {
        dismissedOffers.add(offer.offer);
        render();
      });
      return;
    }

    if (offer.direction === "outgoing" && offer.status === "accepted") {
      addButton(
        PANEL_X + 548,
        y,
        76,
        "Finalize",
        true,
        () => void run(() => callbacks.finalizeOffer(offer.offer))
      );
      return;
    }

    if (offer.direction === "outgoing" && offer.status === "open") {
      addButton(
        PANEL_X + 548,
        y,
        76,
        "Cancel",
        true,
        () => void run(() => callbacks.cancelOffer(offer.offer))
      );
      return;
    }

    const statusLabel =
      offer.direction === "incoming" && offer.status === "accepted"
        ? "Buyer finalizes"
        : offer.status;
    const status = scene.add
      .text(PANEL_X + 548, y + 7, statusLabel, {
        color: "#4b6259",
        fixedWidth: 76,
        fontFamily: "Inter, sans-serif",
        fontSize: "9px",
        fontStyle: "700",
        align: "center",
        wordWrap: { width: 76 },
      })
      .setDepth(DEPTH + 1);
    dynamic.push(status);
  };

  const render = () => {
    destroyDynamic();
    goldText.setText(`Gold ${gold.amount.toString()}`);
    const nearby = nearbyPlayers();

    if (
      selectedSellerMint &&
      !nearby.some(({ player }) => player.mint === selectedSellerMint)
    ) {
      selectedSellerMint = null;
    }

    const selectedSeller = nearby.find(
      ({ player }) => player.mint === selectedSellerMint
    )?.player;
    const selectedItemId = callbacks.getSelectedItemId();

    selectedText.setText(
      selectedSeller
        ? `Seller ${shortMint(selectedSeller.mint)} at d${
            nearby.find(({ player }) => player.mint === selectedSeller.mint)
              ?.distance ?? 0
          }`
        : nearby.length > 0
        ? "Choose a nearby seller"
        : "No adjacent players"
    );
    offerText.setText(
      selectedItemId
        ? `${getFarmItemLabel(
            selectedItemId
          )} x${itemQuantity} for ${goldAmount}G`
        : "Select an inventory item first"
    );

    addButton(PANEL_X + 276, PANEL_Y + 12, 20, "-", true, () => {
      goldAmount = Math.max(1, goldAmount - 1);
      render();
    });
    addButton(
      PANEL_X + 302,
      PANEL_Y + 12,
      54,
      `${goldAmount}G`,
      false,
      () => {}
    );
    addButton(PANEL_X + 362, PANEL_Y + 12, 20, "+", true, () => {
      goldAmount += 1;
      render();
    });
    addButton(PANEL_X + 276, PANEL_Y + 40, 20, "-", true, () => {
      itemQuantity = Math.max(1, itemQuantity - 1);
      render();
    });
    addButton(
      PANEL_X + 302,
      PANEL_Y + 40,
      54,
      `x${itemQuantity}`,
      false,
      () => {}
    );
    addButton(PANEL_X + 362, PANEL_Y + 40, 20, "+", true, () => {
      itemQuantity += 1;
      render();
    });

    nearby.slice(0, 3).forEach(({ player, distance }, index) => {
      const x = PANEL_X + 14 + index * 80;
      addButton(
        x,
        PANEL_Y + 68,
        72,
        `${shortMint(player.mint)} d${distance}`,
        true,
        () => {
          selectedSellerMint = player.mint;
          render();
        }
      );
    });

    addButton(
      PANEL_X + 276,
      PANEL_Y + 68,
      106,
      busy ? "Working" : "Offer",
      Boolean(selectedSeller && selectedItemId && !busy),
      () =>
        void run(() =>
          callbacks.createOffer({
            sellerMint: selectedSeller?.mint ?? "",
            itemId: selectedItemId ?? 0,
            itemQuantity,
            goldAmount,
          })
        )
    );

    const visibleOffers = offers
      .filter((offer) => !dismissedOffers.has(offer.offer))
      .slice(0, 3);
    if (visibleOffers.length === 0) {
      const empty = scene.add
        .text(PANEL_X + 392, PANEL_Y + 38, "No active offers", {
          color: "#4b6259",
          fixedWidth: 220,
          fontFamily: "Inter, sans-serif",
          fontSize: "10px",
          wordWrap: { width: 220 },
        })
        .setDepth(DEPTH + 1);
      dynamic.push(empty);
      return;
    }

    visibleOffers.forEach(renderOfferRow);
  };

  render();

  return {
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
    syncSelectedQuantity(quantity: number) {
      itemQuantity = Math.max(1, quantity);
      render();
    },
  };
};
