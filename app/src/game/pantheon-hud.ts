import Phaser from "phaser";
import { UI_ASSETS, UI_ICONS } from "../assets/ui-assets";
import type { HudController, HudSnapshot } from "../client/hud";
import { getFarmItemLabel } from "./farm";
import type {
  FarmActionMode,
  GoldBalanceState,
  GridPoint,
  InventoryState,
  TradeOfferState,
  VisiblePlayerState,
} from "./types";

type TradeCallbacks = {
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

type PantheonHudOptions = {
  onModeChange: (mode: FarmActionMode) => void;
  onItemSelect: (itemId: number | null) => void;
  onQuantityChange: (quantity: number) => void;
  trade: TradeCallbacks;
};

type ToolDefinition = {
  mode: FarmActionMode;
  label: string;
  icon: keyof typeof UI_ICONS;
  shortcut: string;
};

type ToolSlot = {
  mode: FarmActionMode;
  container: Phaser.GameObjects.Container;
  selected: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
};

type InventorySlot = {
  itemId: number | null;
  container: Phaser.GameObjects.Container;
  selected: Phaser.GameObjects.Image;
  icon: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  count: Phaser.GameObjects.Text;
};

const hudFontFamily = "Inter, system-ui, sans-serif";
const tools: ToolDefinition[] = [
  { mode: "move", label: "Move", icon: "hands", shortcut: "1" },
  { mode: "till", label: "Hoe", icon: "dig", shortcut: "2" },
  { mode: "water", label: "Water", icon: "wateringCan", shortcut: "3" },
  { mode: "plant", label: "Plant", icon: "plant", shortcut: "4" },
  { mode: "harvest", label: "Harvest", icon: "harvest", shortcut: "5" },
  { mode: "chop", label: "Axe", icon: "axe", shortcut: "6" },
  { mode: "grab", label: "Grab", icon: "grab", shortcut: "7" },
  { mode: "drop", label: "Drop", icon: "drop", shortcut: "8" },
];

export const createPantheonHud = (
  scene: Phaser.Scene,
  hud: HudController,
  options: PantheonHudOptions
) => {
  const root = scene.add.container(0, 0).setDepth(10000).setScrollFactor(0);
  const leftPanel = scene.add.container(16, 16).setScrollFactor(0);
  const timePanel = scene.add.container(0, 12).setScrollFactor(0);
  const toolPanel = scene.add.container(0, 0).setScrollFactor(0);
  const actionPanel = scene.add.container(0, 0).setScrollFactor(0);
  const tradePanel = scene.add.container(18, 0).setScrollFactor(0);
  const systemPanel = scene.add.container(0, 18).setScrollFactor(0);

  root.add([
    leftPanel,
    timePanel,
    toolPanel,
    actionPanel,
    tradePanel,
    systemPanel,
  ]);

  const statusBg = scene.add
    .image(0, 0, UI_ASSETS.toastCardPanel.key)
    .setOrigin(0)
    .setDisplaySize(420, 150)
    .setAlpha(0.96);
  const titleText = makeText(scene, 26, 18, "Open Wilds", 20, "#f6efd7", 180);
  const walletText = makeText(
    scene,
    26,
    50,
    "Wallet: creating...",
    12,
    "#dce8e2",
    360
  );
  const networkText = makeText(
    scene,
    26,
    72,
    "Network: preparing...",
    12,
    "#dce8e2",
    360
  );
  const programText = makeText(
    scene,
    26,
    94,
    "Programs: checking...",
    12,
    "#dce8e2",
    360
  );
  const playerText = makeText(
    scene,
    26,
    118,
    "Player: 10, 10",
    12,
    "#f1d38b",
    360
  );

  leftPanel.add([
    statusBg,
    titleText,
    walletText,
    networkText,
    programText,
    playerText,
  ]);

  const timeArtwork = scene.add
    .image(132, 68, UI_ASSETS.dateTimeArtwork.key)
    .setDisplaySize(130, 130)
    .setAlpha(0.95);
  const timeFrame = scene.add
    .image(132, 58, UI_ASSETS.dateTimeHalfcircleFrame.key)
    .setDisplaySize(170, 118);
  const timeBg = scene.add
    .image(132, 128, UI_ASSETS.dateTimePanel.key)
    .setDisplaySize(210, 92);
  const timeText = makeText(
    scene,
    32,
    108,
    "Day 1 · 00:00",
    16,
    "#f6efd7",
    200
  );
  timeText.setAlign("center");
  timePanel.add([timeArtwork, timeFrame, timeBg, timeText]);

  const toolBg = scene.add
    .image(0, 0, UI_ASSETS.inventoryPanel.key)
    .setOrigin(0)
    .setDisplaySize(860, 120);
  const toolSlots: ToolSlot[] = tools.map((tool, index) => {
    const x = 22 + index * 82;
    const container = scene.add.container(x, 17);
    const bg = scene.add.image(0, 0, UI_ASSETS.inventorySlot.key).setOrigin(0);
    const selected = scene.add
      .image(0, 0, UI_ASSETS.inventorySlotSelected.key)
      .setOrigin(0)
      .setVisible(tool.mode === "move");
    const icon = scene.add
      .image(33, 28, UI_ICONS[tool.icon].key)
      .setDisplaySize(34, 34);
    const shortcut = makeText(scene, 8, 6, tool.shortcut, 10, "#10191f", 18);
    const label = makeText(scene, 5, 66, tool.label, 10, "#f6efd7", 58);

    label.setAlign("center");
    container.add([bg, selected, icon, shortcut, label]);
    container
      .setSize(68, 84)
      .setInteractive(
        new Phaser.Geom.Rectangle(0, 0, 68, 84),
        Phaser.Geom.Rectangle.Contains
      )
      .on("pointerdown", () => selectMode(tool.mode));
    return { mode: tool.mode, container, selected, label };
  });
  const inventoryLabel = makeText(
    scene,
    698,
    16,
    "Inventory",
    12,
    "#f1d38b",
    130
  );
  const inventorySlots: InventorySlot[] = Array.from(
    { length: 4 },
    (_, index) => {
      const container = scene.add.container(692 + index * 38, 42);
      const bg = scene.add
        .image(0, 0, UI_ASSETS.inventorySlot.key)
        .setOrigin(0)
        .setDisplaySize(34, 34);
      const selected = scene.add
        .image(0, 0, UI_ASSETS.inventorySlotSelected.key)
        .setOrigin(0)
        .setDisplaySize(34, 34)
        .setVisible(false);
      const icon = scene.add
        .image(17, 15, UI_ICONS.forage.key)
        .setDisplaySize(22, 22)
        .setVisible(false);
      const count = makeText(scene, 13, 20, "", 9, "#f6efd7", 20);
      const label = makeText(scene, -6, 38, "", 8, "#dce8e2", 46);

      label.setAlign("center");
      container.add([bg, selected, icon, count, label]);
      container
        .setSize(34, 58)
        .setInteractive(
          new Phaser.Geom.Rectangle(0, 0, 34, 58),
          Phaser.Geom.Rectangle.Contains
        )
        .on("pointerdown", () => {
          if (inventorySlots[index].itemId === null) {
            return;
          }

          selectedItemId =
            selectedItemId === inventorySlots[index].itemId
              ? null
              : inventorySlots[index].itemId;
          selectedQuantity = 1;
          options.onItemSelect(selectedItemId);
          options.onQuantityChange(selectedQuantity);
          syncInventorySelection();
        });

      return { itemId: null, container, selected, icon, label, count };
    }
  );

  toolPanel.add([
    toolBg,
    ...toolSlots.map((slot) => slot.container),
    inventoryLabel,
    ...inventorySlots.map((slot) => slot.container),
  ]);

  const actionIcon = scene.add
    .image(0, 0, UI_ASSETS.actionProgressIconContainer.key)
    .setDisplaySize(74, 60);
  const actionTrack = scene.add
    .image(66, 10, UI_ASSETS.actionProgressBarTrack.key)
    .setOrigin(0)
    .setDisplaySize(260, 48);
  const actionFill = scene.add
    .image(78, 22, UI_ASSETS.actionProgressBarFiller.key)
    .setOrigin(0, 0.5)
    .setDisplaySize(0, 18);
  const actionLabel = makeText(scene, 82, 12, "Acting", 12, "#10191f", 190);
  const actionTime = makeText(scene, 246, 12, "0s", 12, "#10191f", 56);
  actionPanel.add([
    actionIcon,
    actionTrack,
    actionFill,
    actionLabel,
    actionTime,
  ]);
  actionPanel.setVisible(false);

  const tradeBg = scene.add
    .image(0, 0, UI_ASSETS.toastCardPanel.key)
    .setOrigin(0)
    .setDisplaySize(430, 108)
    .setAlpha(0.95);
  const tradeTitle = makeText(scene, 24, 16, "Trade", 15, "#f6efd7", 76);
  const goldText = makeText(scene, 98, 17, "Gold 0", 13, "#f1d38b", 120);
  const tradeText = makeText(
    scene,
    24,
    44,
    "No nearby trader",
    11,
    "#dce8e2",
    360
  );
  tradePanel.add([tradeBg, tradeTitle, goldText, tradeText]);
  tradePanel
    .setSize(430, 108)
    .setInteractive(
      new Phaser.Geom.Rectangle(0, 0, 430, 108),
      Phaser.Geom.Rectangle.Contains
    )
    .on("pointerdown", () => runPrimaryTradeAction());

  const settingsButton = makeSystemButton(scene, 0, "settings", () =>
    toggleSettingsPanel()
  );
  const mapButton = makeSystemButton(scene, 58, "map", () => undefined);
  const journalButton = makeSystemButton(
    scene,
    116,
    "journal",
    () => undefined
  );
  systemPanel.add([settingsButton, mapButton, journalButton]);

  let selectedMode: FarmActionMode = "move";
  let selectedItemId: number | null = null;
  let selectedQuantity = 1;
  let localPosition: GridPoint | null = null;
  let players: VisiblePlayerState[] = [];
  let offers: TradeOfferState[] = [];
  let gold: GoldBalanceState = { amount: 0n };
  let selectedSellerMint: string | null = null;
  let lastInventory: InventoryState = { slots: [] };

  const unsubscribe = hud.subscribe((snapshot) => renderSnapshot(snapshot));
  document
    .getElementById("settings-close-button")
    ?.addEventListener("click", closeSettingsPanel);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
    document
      .getElementById("settings-close-button")
      ?.removeEventListener("click", closeSettingsPanel)
  );
  scene.scale.on("resize", layout);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
    scene.scale.off("resize", layout)
  );
  layout();

  const keyboard = scene.input.keyboard;
  if (keyboard) {
    tools.forEach((tool, index) => {
      keyboard.on(`keydown-${index + 1}`, () => selectMode(tool.mode));
    });
  }

  return {
    updateInventory(inventory: InventoryState) {
      lastInventory = inventory;
      renderInventory();
    },
    updateGoldBalance(balance: GoldBalanceState) {
      gold = balance;
      renderTrade();
    },
    updateLocalPosition(position: GridPoint) {
      localPosition = position;
      renderTrade();
    },
    updateVisiblePlayers(nextPlayers: VisiblePlayerState[]) {
      players = nextPlayers;
      renderTrade();
    },
    updateTradeOffers(nextOffers: TradeOfferState[]) {
      offers = nextOffers;
      renderTrade();
    },
    selectSeller(mint: string) {
      selectedSellerMint = mint;
      renderTrade();
    },
    syncSelectedQuantity(quantity: number) {
      selectedQuantity = Math.max(1, quantity);
      options.onQuantityChange(selectedQuantity);
      renderTrade();
    },
    setPlayerStatus(text: string) {
      playerText.setText(text);
    },
    setActionProgress(args: {
      visible: boolean;
      label: string;
      remainingSeconds: number;
      progress: number;
    }) {
      actionPanel.setVisible(args.visible);
      if (!args.visible) {
        actionFill.setDisplaySize(0, 18);
        return;
      }

      actionLabel.setText(args.label);
      actionTime.setText(`${Math.ceil(args.remainingSeconds)}s`);
      actionFill.setDisplaySize(
        232 * Math.min(1, Math.max(0, args.progress)),
        18
      );
    },
  };

  function selectMode(mode: FarmActionMode) {
    selectedMode = mode;
    toolSlots.forEach((slot) => slot.selected.setVisible(slot.mode === mode));
    options.onModeChange(mode);
  }

  function renderSnapshot(snapshot: HudSnapshot) {
    walletText.setText(
      `${short(snapshot.walletAddress)} · ${snapshot.walletBalance}`
    );
    networkText.setText(snapshot.networkStatus);
    programText.setText(snapshot.programStatus);
    timeText.setText(snapshot.gameTimeStatus);
  }

  function renderInventory() {
    const visibleSlots = lastInventory.slots.slice(0, inventorySlots.length);

    if (
      selectedItemId !== null &&
      !lastInventory.slots.some((slot) => slot.itemId === selectedItemId)
    ) {
      selectedItemId = null;
      options.onItemSelect(null);
    }

    inventorySlots.forEach((slot, index) => {
      const inventory = visibleSlots[index];
      slot.itemId = inventory?.itemId ?? null;
      slot.icon.setVisible(Boolean(inventory));
      slot.count.setText(
        inventory && inventory.quantity > 1 ? `${inventory.quantity}` : ""
      );
      slot.label.setText(inventory ? compactItemLabel(inventory.itemId) : "");
    });
    syncInventorySelection();
    renderTrade();
  }

  function syncInventorySelection() {
    inventorySlots.forEach((slot) =>
      slot.selected.setVisible(
        slot.itemId !== null && slot.itemId === selectedItemId
      )
    );
  }

  function renderTrade() {
    goldText.setText(`Gold ${gold.amount.toString()}`);
    const nearby = players
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

    if (
      selectedSellerMint &&
      !nearby.some(({ player }) => player.mint === selectedSellerMint)
    ) {
      selectedSellerMint = null;
    }

    const selectedSeller = nearby.find(
      ({ player }) => player.mint === selectedSellerMint
    )?.player;
    const openOffer = offers.find((offer) => offer.status !== "finalized");

    if (selectedSeller && selectedItemId) {
      tradeText.setText(
        `Ready: ${getFarmItemLabel(
          selectedItemId
        )} x${selectedQuantity} with ${short(selectedSeller.mint)}`
      );
      return;
    }

    if (selectedSeller) {
      tradeText.setText(
        `Nearby trader ${short(selectedSeller.mint)}. Select an item.`
      );
      return;
    }

    if (openOffer) {
      tradeText.setText(
        `${openOffer.direction}: ${getFarmItemLabel(openOffer.itemId)} x${
          openOffer.itemQuantity
        } for ${openOffer.goldAmount.toString()}G`
      );
      return;
    }

    tradeText.setText(
      nearby.length ? "Select a nearby trader" : "No nearby trader"
    );
  }

  function layout() {
    const width = scene.scale.width;
    const height = scene.scale.height;

    timePanel.setPosition(Math.max(18, width - 250), 12);
    toolPanel.setPosition(Math.max(12, (width - 860) / 2), height - 136);
    actionPanel.setPosition(Math.max(18, (width - 326) / 2), height - 220);
    tradePanel.setPosition(18, height - 130);
    systemPanel.setPosition(width - 190, 18);
  }

  function toggleSettingsPanel() {
    const panel = document.getElementById("solana-settings-panel");
    if (!panel) {
      return;
    }

    panel.hidden = !panel.hidden;
  }

  function closeSettingsPanel() {
    const panel = document.getElementById("solana-settings-panel");
    if (panel) {
      panel.hidden = true;
    }
  }

  function runPrimaryTradeAction() {
    const selectedSeller = players.find(
      (player) => player.mint === selectedSellerMint
    );
    const offer = offers.find((candidate) => candidate.status !== "finalized");

    if (selectedSeller && selectedItemId) {
      void options.trade.createOffer({
        sellerMint: selectedSeller.mint,
        itemId: selectedItemId,
        itemQuantity: selectedQuantity,
        goldAmount: 1,
      });
      return;
    }

    if (offer?.direction === "incoming" && offer.status === "open") {
      void options.trade.acceptOffer(offer.offer);
      return;
    }

    if (offer?.direction === "outgoing" && offer.status === "accepted") {
      void options.trade.finalizeOffer(offer.offer);
      return;
    }

    if (offer?.direction === "outgoing" && offer.status === "open") {
      void options.trade.cancelOffer(offer.offer);
    }
  }
};

function makeText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  fontSize: number,
  color: string,
  width: number
) {
  return scene.add
    .text(x, y, text, {
      color,
      fixedWidth: width,
      fontFamily: hudFontFamily,
      fontSize: `${fontSize}px`,
      fontStyle: "700",
      shadow: {
        color: "#071018",
        blur: 4,
        fill: true,
        offsetX: 1,
        offsetY: 1,
      },
      wordWrap: { width },
    })
    .setScrollFactor(0);
}

function makeSystemButton(
  scene: Phaser.Scene,
  x: number,
  id: "settings" | "map" | "journal",
  onClick: () => void
) {
  const container = scene.add.container(x, 0);
  const asset =
    id === "settings"
      ? UI_ASSETS.settingsInactive
      : id === "map"
      ? UI_ASSETS.mapInactive
      : UI_ASSETS.journalInactive;
  const icon =
    id === "settings"
      ? UI_ICONS.settings
      : id === "map"
      ? UI_ICONS.forage
      : UI_ICONS.hands;
  const bg = scene.add
    .image(0, 0, asset.key)
    .setOrigin(0)
    .setDisplaySize(52, 56);
  const image = scene.add.image(26, 26, icon.key).setDisplaySize(28, 28);

  container.add([bg, image]);
  container
    .setSize(52, 56)
    .setInteractive(
      new Phaser.Geom.Rectangle(0, 0, 52, 56),
      Phaser.Geom.Rectangle.Contains
    )
    .on("pointerdown", onClick);

  return container;
}

function short(value: string) {
  if (!value || value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function compactItemLabel(itemId: number) {
  return getFarmItemLabel(itemId)
    .replace(" Seed", "")
    .replace("Wild ", "")
    .replace(" Fiber", "");
}
