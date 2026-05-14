import Phaser from "phaser";
import { UI_ASSETS } from "../../assets/ui-assets";
import { getFarmItemLabel } from "../farm";
import {
  getItemSpriteFrame,
  getObjectSpriteFrameTexture,
} from "../object-sprite-frames";
import type {
  GoldBalanceState,
  GridPoint,
  InventorySlotState,
  TradeOfferState,
  VisiblePlayerState,
} from "../types";
import { short } from "./text";
import type { TradeCallbacks } from "./types";

type TradeTab = "buy" | "sell";
type TradeCard = {
  container: Phaser.GameObjects.Container;
  background: Phaser.GameObjects.Image;
  itemImage: Phaser.GameObjects.Image;
  placeholder: Phaser.GameObjects.Container;
  placeholderHalo: Phaser.GameObjects.Arc;
  placeholderCore: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  priceText: Phaser.GameObjects.Text;
  actionButton: Phaser.GameObjects.Image;
  actionText: Phaser.GameObjects.Text;
  statusText: Phaser.GameObjects.Text;
  hitArea: Phaser.GameObjects.Zone;
};
type TradeOfferAction = "accept" | "cancel" | "finalize" | null;
type TradeListEntry =
  | {
      kind: "inventory";
      slot: InventorySlotState;
      seller: VisiblePlayerState;
    }
  | {
      kind: "offer";
      offer: TradeOfferState;
      action: TradeOfferAction;
    };

const tabs: Array<{ id: TradeTab; label: string }> = [
  { id: "buy", label: "Buy" },
  { id: "sell", label: "Sell" },
];
const panelWidth = 688;
const panelHeight = 620;
const headerWidth = 415;
const headerHeight = 100;
const cardColumns = 4;
const cardRows = 2;
const itemsPerPage = cardColumns * cardRows;
const cardWidth = 117;
const cardHeight = 190;
const cardGapX = 18;
const cardGapY = 18;
const cardGridWidth = cardColumns * cardWidth + (cardColumns - 1) * cardGapX;
const frameInsetX = (panelWidth - cardGridWidth) / 2;
const frameInsetY = 154;
const headerY = -18;
const tabY = 80;
const tabGap = 134;
const paginationY = 572;
const closeX = panelWidth - 22;
const closeY = 50;
const cardGridLeft = frameInsetX;
const cardGridTop = frameInsetY;
const actionPrice = 1;

export const createTradePanel = (
  scene: Phaser.Scene,
  args: {
    callbacks: TradeCallbacks;
  }
) => {
  const container = scene.add
    .container(0, 0)
    .setScrollFactor(0)
    .setVisible(false);
  const background = scene.add
    .image(0, 82, UI_ASSETS.panel.key)
    .setDisplaySize(panelWidth, panelHeight - 82)
    .setOrigin(0);
  const header = scene.add
    .image((panelWidth - headerWidth) / 2, headerY, UI_ASSETS.panelHeader.key)
    .setDisplaySize(headerWidth, headerHeight)
    .setOrigin(0);
  const title = scene.add
    .text(panelWidth / 2, headerY + headerHeight / 2 - 2, "Trade", {
      align: "center",
      color: "#3d2414",
      fixedWidth: headerWidth - 130,
      fontFamily: "Georgia, Times New Roman, serif",
      fontSize: "34px",
      fontStyle: "italic",
      shadow: {
        color: "#f7e3b8",
        blur: 1,
        fill: true,
        offsetX: 0,
        offsetY: 2,
      },
    })
    .setOrigin(0.5);
  const subtitle = scene.add
    .text(55, 112, "", {
      color: "#4b2a13",
      fixedWidth: panelWidth - 110,
      fontFamily: "Georgia, Times New Roman, serif",
      fontSize: "18px",
      fontStyle: "700",
      shadow: {
        color: "#f7e3b8",
        fill: true,
        offsetX: 0,
        offsetY: 1,
      },
    })
    .setOrigin(0);
  const goldText = scene.add
    .text(panelWidth - 176, 108, "Gold 0", {
      align: "right",
      color: "#5b3218",
      fixedWidth: 120,
      fontFamily: "Georgia, Times New Roman, serif",
      fontSize: "18px",
      fontStyle: "700",
      shadow: {
        color: "#f7e3b8",
        fill: true,
        offsetX: 0,
        offsetY: 1,
      },
    })
    .setOrigin(0)
    .setVisible(false);
  const closeButton = scene.add
    .image(closeX, closeY, UI_ASSETS.panelCloseButton.key)
    .setDisplaySize(52, 51)
    .setOrigin(0.5);
  const closeHitArea = scene.add
    .zone(closeX, closeY, 64, 64)
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });
  const tabControls = tabs.map((tab, index) => createTab(tab, index));
  const cards = Array.from({ length: itemsPerPage }, (_, index) =>
    createCard(index)
  );
  const pagination = createPagination();
  const emptyText = scene.add
    .text(panelWidth / 2, 292, "", {
      align: "center",
      color: "#5b3218",
      fixedWidth: panelWidth - 110,
      fontFamily: "Georgia, Times New Roman, serif",
      fontSize: "22px",
      fontStyle: "700",
      shadow: {
        color: "#f7e3b8",
        fill: true,
        offsetX: 0,
        offsetY: 2,
      },
    })
    .setOrigin(0.5)
    .setVisible(false);
  let localPosition: GridPoint | null = null;
  let players: VisiblePlayerState[] = [];
  let offers: TradeOfferState[] = [];
  let gold: GoldBalanceState = { amount: 0n };
  let selectedSellerMint: string | null = null;
  let activeTab: TradeTab = "buy";
  let pageByTab: Record<TradeTab, number> = { buy: 0, sell: 0 };
  let closedOfferKey: string | null = null;

  container.add([
    background,
    ...cards.map((card) => card.container),
    pagination.container,
    ...tabControls.map((tab) => tab.container),
    emptyText,
    header,
    title,
    subtitle,
    goldText,
    closeButton,
    closeHitArea,
  ]);
  container.setSize(panelWidth, panelHeight);

  closeHitArea.on(
    "pointerdown",
    (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData
    ) => {
      event.stopPropagation();
      closePanel();
    }
  );
  tabControls.forEach((tab) =>
    tab.hitArea.on(
      "pointerdown",
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData
      ) => {
        event.stopPropagation();
        activeTab = tab.id;
        clampPage();
        render();
      }
    )
  );
  cards.forEach((card, index) =>
    card.hitArea.on(
      "pointerdown",
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData
      ) => {
        event.stopPropagation();
        handleCardClick(index);
      }
    )
  );
  pagination.previousHitArea.on(
    "pointerdown",
    (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData
    ) => {
      event.stopPropagation();
      setPage(pageIndex() - 1);
    }
  );
  pagination.nextHitArea.on(
    "pointerdown",
    (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData
    ) => {
      event.stopPropagation();
      setPage(pageIndex() + 1);
    }
  );

  return {
    container,
    width: panelWidth,
    height: panelHeight,
    containsPoint(x: number, y: number) {
      return containsPanelPoint(x, y);
    },
    handlePointerDown(x: number, y: number) {
      if (!containsPanelPoint(x, y)) {
        return false;
      }

      if (containsRect(x, y, closeX - 32, closeY - 32, 64, 64)) {
        closePanel();
        return true;
      }

      const clickedTab = tabControls.find((tab) => {
        const tabX = tab.container.x + tab.hitArea.x;
        const tabY = tab.container.y + tab.hitArea.y;

        return containsRect(
          x,
          y,
          tabX - tab.hitArea.width / 2,
          tabY - tab.hitArea.height / 2,
          tab.hitArea.width,
          tab.hitArea.height
        );
      });

      if (clickedTab) {
        activeTab = clickedTab.id;
        clampPage();
        render();
        return true;
      }

      const clickedCardIndex = cards.findIndex((card) => {
        if (!card.container.visible || card.hitArea.input?.enabled === false) {
          return false;
        }

        const hitX = card.container.x + card.hitArea.x;
        const hitY = card.container.y + card.hitArea.y;

        return containsRect(
          x,
          y,
          hitX - card.hitArea.width / 2,
          hitY - card.hitArea.height / 2,
          card.hitArea.width,
          card.hitArea.height
        );
      });

      if (clickedCardIndex >= 0) {
        handleCardClick(clickedCardIndex);
        return true;
      }

      if (pagination.container.visible) {
        const previousX = pagination.container.x + pagination.previousHitArea.x;
        const previousY = pagination.container.y + pagination.previousHitArea.y;
        const nextX = pagination.container.x + pagination.nextHitArea.x;
        const nextY = pagination.container.y + pagination.nextHitArea.y;

        if (
          pagination.previousHitArea.input?.enabled !== false &&
          containsRect(
            x,
            y,
            previousX - pagination.previousHitArea.width / 2,
            previousY - pagination.previousHitArea.height / 2,
            pagination.previousHitArea.width,
            pagination.previousHitArea.height
          )
        ) {
          setPage(pageIndex() - 1);
          return true;
        }

        if (
          pagination.nextHitArea.input?.enabled !== false &&
          containsRect(
            x,
            y,
            nextX - pagination.nextHitArea.width / 2,
            nextY - pagination.nextHitArea.height / 2,
            pagination.nextHitArea.width,
            pagination.nextHitArea.height
          )
        ) {
          setPage(pageIndex() + 1);
          return true;
        }
      }

      return true;
    },
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
      if (
        selectedSellerMint &&
        !players.some((player) => player.mint === selectedSellerMint)
      ) {
        selectedSellerMint = null;
      }
      render();
    },
    updateTradeOffers(nextOffers: TradeOfferState[]) {
      const previousKey = offerKey(offers);
      offers = nextOffers;
      const nextKey = offerKey(offers);
      if (
        activeOffers().length > 0 &&
        !container.visible &&
        nextKey !== closedOfferKey &&
        nextKey !== previousKey
      ) {
        activeTab = "sell";
        openPanel();
      }
      render();
    },
    selectSeller(mint: string) {
      selectedSellerMint = mint;
      activeTab = "buy";
      pageByTab.buy = 0;
      openPanel();
      render();
    },
    close: closePanel,
  };

  function createTab(tab: { id: TradeTab; label: string }, index: number) {
    const centerX = panelWidth / 2 - ((tabs.length - 1) * tabGap) / 2;
    const container = scene.add.container(centerX + index * tabGap, tabY);
    const stand = scene.add
      .image(0, 24, UI_ASSETS.panelTabStand.key)
      .setDisplaySize(133, 45)
      .setOrigin(0.5);
    const background = scene.add
      .image(0, 16, UI_ASSETS.panelTabLabelInactive.key)
      .setDisplaySize(90, 41)
      .setOrigin(0.5);
    const text = scene.add
      .text(0, 15, tab.label, {
        align: "center",
        color: "#3d2414",
        fixedWidth: 84,
        fontFamily: "Georgia, Times New Roman, serif",
        fontSize: "21px",
        shadow: {
          color: "#f6d9a4",
          blur: 1,
          fill: true,
          offsetX: 0,
          offsetY: 1,
        },
      })
      .setOrigin(0.5);
    const hitArea = scene.add
      .zone(0, 16, 108, 50)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    container.add([stand, background, text, hitArea]);

    return { ...tab, container, background, text, hitArea };
  }

  function createCard(index: number): TradeCard {
    const column = index % cardColumns;
    const row = Math.floor(index / cardColumns);
    const x = cardGridLeft + column * (cardWidth + cardGapX);
    const y = cardGridTop + row * (cardHeight + cardGapY);
    const container = scene.add.container(x, y).setVisible(false);
    const background = scene.add
      .image(0, 0, UI_ASSETS.panelItemsGridPanel.key)
      .setDisplaySize(cardWidth, cardHeight)
      .setOrigin(0);
    const itemImage = scene.add
      .image(cardWidth / 2, 55, UI_ASSETS.panelItemsGridPanel.key)
      .setVisible(false)
      .setOrigin(0.5);
    const placeholder = scene.add.container(cardWidth / 2, 55);
    const placeholderHalo = scene.add
      .circle(0, 0, 42, 0xf5dca1, 0.16)
      .setStrokeStyle(2, 0x8b5b2d, 0.34);
    const placeholderCore = scene.add
      .circle(0, 0, 19, 0xf8e8ba, 0.58)
      .setStrokeStyle(1, 0x5c351c, 0.32);
    const coin = createCoin(28, 122);
    const priceText = scene.add
      .text(43, 122, "", {
        align: "center",
        color: "#4b2a13",
        fixedWidth: 58,
        fontFamily: "Georgia, Times New Roman, serif",
        fontSize: "22px",
        fontStyle: "700",
        shadow: {
          color: "#f6dfb4",
          blur: 1,
          fill: true,
          offsetX: 0,
          offsetY: 1,
        },
      })
      .setOrigin(0, 0.5);
    const label = scene.add
      .text(cardWidth / 2, 96, "", {
        align: "center",
        color: "#5b3218",
        fixedWidth: 98,
        fontFamily: "Georgia, Times New Roman, serif",
        fontSize: "13px",
        fontStyle: "700",
        shadow: {
          color: "#f6dfb4",
          blur: 1,
          fill: true,
          offsetX: 0,
          offsetY: 1,
        },
        wordWrap: { width: 98 },
      })
      .setOrigin(0.5);
    const actionButton = scene.add
      .image(cardWidth / 2, 165, UI_ASSETS.panelItemsGridPanelBuy.key)
      .setDisplaySize(101, 48)
      .setOrigin(0.5);
    const actionText = scene.add
      .text(cardWidth / 2, 164, "Buy", {
        align: "center",
        color: "#fff8dd",
        fixedWidth: 92,
        fontFamily: "Georgia, Times New Roman, serif",
        fontSize: "24px",
        fontStyle: "700",
        shadow: {
          color: "#143b59",
          blur: 2,
          fill: true,
          offsetX: 0,
          offsetY: 2,
        },
        stroke: "#183b52",
        strokeThickness: 2,
      })
      .setOrigin(0.5);
    const statusText = scene.add
      .text(cardWidth / 2, 145, "", {
        align: "center",
        color: "#6b4721",
        fixedWidth: 92,
        fontFamily: "Georgia, Times New Roman, serif",
        fontSize: "12px",
        fontStyle: "700",
      })
      .setOrigin(0.5)
      .setVisible(false);
    const hitArea = scene.add
      .zone(cardWidth / 2, 165, 101, 48)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    placeholder.add([placeholderHalo, placeholderCore]);
    container.add([
      background,
      itemImage,
      placeholder,
      coin,
      priceText,
      label,
      actionButton,
      actionText,
      statusText,
      hitArea,
    ]);

    return {
      container,
      background,
      itemImage,
      placeholder,
      placeholderHalo,
      placeholderCore,
      label,
      priceText,
      actionButton,
      actionText,
      statusText,
      hitArea,
    };
  }

  function createPagination() {
    const container = scene.add
      .container(panelWidth / 2, paginationY)
      .setVisible(false);
    const background = scene.add
      .image(0, 24, UI_ASSETS.panelPaginationPanel.key)
      .setDisplaySize(225, 48)
      .setOrigin(0.5);
    const previousButton = scene.add
      .image(-92, 24, UI_ASSETS.panelPaginationButtonPrevActive.key)
      .setDisplaySize(40, 45)
      .setOrigin(0.5);
    const nextButton = scene.add
      .image(92, 24, UI_ASSETS.panelPaginationButtonNextActive.key)
      .setDisplaySize(40, 45)
      .setOrigin(0.5);
    const pageText = scene.add
      .text(0, 24, "1 / 1", {
        align: "center",
        color: "#3d2414",
        fixedWidth: 112,
        fontFamily: "Georgia, Times New Roman, serif",
        fontSize: "26px",
        fontStyle: "700",
        shadow: {
          color: "#f6d9a4",
          blur: 1,
          fill: true,
          offsetX: 0,
          offsetY: 2,
        },
      })
      .setOrigin(0.5);
    const previousHitArea = scene.add
      .zone(-92, 24, 50, 54)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    const nextHitArea = scene.add
      .zone(92, 24, 50, 54)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    container.add([
      background,
      previousButton,
      nextButton,
      pageText,
      previousHitArea,
      nextHitArea,
    ]);

    return {
      container,
      previousButton,
      nextButton,
      pageText,
      previousHitArea,
      nextHitArea,
    };
  }

  function createCoin(x: number, y: number) {
    const container = scene.add.container(x, y);
    const rim = scene.add
      .circle(0, 0, 9, 0x8b4a12, 1)
      .setStrokeStyle(1, 0xefd083, 0.8);
    const face = scene.add.circle(0, 0, 6, 0xf0b62e, 1);
    const shine = scene.add.ellipse(-2, -3, 4, 2, 0xffef9d, 0.86);

    container.add([rim, face, shine]);

    return container;
  }

  function render() {
    if (
      selectedSellerMint &&
      !players.some((player) => player.mint === selectedSellerMint)
    ) {
      selectedSellerMint = null;
      if (activeTab === "buy") {
        activeTab = activeOffers().length > 0 ? "sell" : "buy";
      }
    }

    clampPage();
    renderTabs();
    renderCards();
    renderPagination();
    renderHeader();
  }

  function renderHeader() {
    const seller = selectedTradePartner();
    const entries = activeEntries();

    if (activeTab === "buy") {
      subtitle.setText("");
      emptyText.setText(seller ? "No listed items" : "No trader selected");
    } else {
      subtitle.setText("");
      emptyText.setText("No active offers");
    }

    emptyText.setVisible(entries.length === 0);
  }

  function renderTabs() {
    tabControls.forEach((tab) => {
      const active = tab.id === activeTab;
      const texture = !active
        ? UI_ASSETS.panelTabLabelInactive.key
        : tab.id === "buy"
        ? UI_ASSETS.panelTabLabelActiveBlue.key
        : UI_ASSETS.panelTabLabelActiveGreen.key;

      tab.background.setTexture(texture);
      tab.background.setDisplaySize(active ? 92 : 90, active ? 42 : 41);
      tab.text.setColor(active ? "#fff8d7" : "#3d2414");
      tab.text.setShadow(
        0,
        active ? 2 : 1,
        active ? "#193a12" : "#f6d9a4",
        active ? 2 : 1,
        true,
        true
      );
      tab.container.setDepth(active ? 2 : 1);
    });
  }

  function renderCards() {
    const entries = activeEntries();
    const start = pageIndex() * itemsPerPage;

    cards.forEach((card, index) => {
      const entry = entries[start + index];
      card.container.setVisible(Boolean(entry));

      if (!entry) {
        return;
      }

      if (entry.kind === "inventory") {
        renderInventoryCard(card, entry);
      } else {
        renderOfferCard(card, entry);
      }
    });
  }

  function renderInventoryCard(
    card: TradeCard,
    entry: Extract<TradeListEntry, { kind: "inventory" }>
  ) {
    const disabled = entry.slot.quantity <= 0;

    renderCardItem(card, entry.slot.itemId, disabled);
    card.label.setText(
      `${getFarmItemLabel(entry.slot.itemId)} x${entry.slot.quantity}`
    );
    card.priceText.setText(actionPrice.toString());
    card.actionButton
      .setTexture(UI_ASSETS.panelItemsGridPanelBuy.key)
      .setAlpha(disabled ? 0.56 : 1);
    card.actionText.setText("Buy").setAlpha(disabled ? 0.56 : 1);
    card.statusText.setVisible(false);
    card.hitArea.input!.enabled = !disabled;
    card.background.setAlpha(disabled ? 0.62 : 1);
  }

  function renderOfferCard(
    card: TradeCard,
    entry: Extract<TradeListEntry, { kind: "offer" }>
  ) {
    const offer = entry.offer;
    const disabled = entry.action === null;

    renderCardItem(card, offer.itemId, disabled);
    card.label.setText(
      `${getFarmItemLabel(offer.itemId)} x${offer.itemQuantity}`
    );
    card.priceText.setText(offer.goldAmount.toString());
    card.actionButton
      .setTexture(UI_ASSETS.panelItemsGridPanelSell.key)
      .setAlpha(disabled ? 0.56 : 1);
    card.actionText
      .setText(actionLabel(entry.action))
      .setAlpha(disabled ? 0.56 : 1);
    card.statusText.setText(statusLabel(offer)).setVisible(false);
    card.hitArea.input!.enabled = !disabled;
    card.background.setAlpha(disabled ? 0.62 : 1);
  }

  function renderCardItem(card: TradeCard, itemId: number, disabled: boolean) {
    const frame = getItemSpriteFrame(itemId);
    const texture = getObjectSpriteFrameTexture(
      scene,
      frame.assetId,
      frame.frame
    );

    if (texture) {
      card.itemImage
        .setTexture(texture.key)
        .setDisplaySize(86, 86)
        .setAlpha(disabled ? 0.5 : 1)
        .setVisible(true);
      card.placeholder.setVisible(false);
      return;
    }

    card.itemImage.setVisible(false);
    card.placeholderHalo
      .setFillStyle(0xf5dca1, disabled ? 0.1 : 0.16)
      .setStrokeStyle(2, 0x8b5b2d, disabled ? 0.18 : 0.34);
    card.placeholderCore
      .setFillStyle(0xf8e8ba, disabled ? 0.3 : 0.58)
      .setStrokeStyle(1, 0x5c351c, disabled ? 0.18 : 0.32);
    card.placeholder.setAlpha(disabled ? 0.6 : 1).setVisible(true);
  }

  function renderPagination() {
    const count = pageCount();
    const hasMultiplePages = count > 1;
    const hasPrevious = pageIndex() > 0;
    const hasNext = pageIndex() < count - 1;

    pagination.container.setVisible(hasMultiplePages);

    if (!hasMultiplePages) {
      return;
    }

    pagination.previousButton.setTexture(
      hasPrevious
        ? UI_ASSETS.panelPaginationButtonPrevActive.key
        : UI_ASSETS.panelPaginationButtonPrevInactive.key
    );
    pagination.nextButton.setTexture(
      hasNext
        ? UI_ASSETS.panelPaginationButtonNextActive.key
        : UI_ASSETS.panelPaginationButtonNextInactive.key
    );
    pagination.pageText.setText(`${pageIndex() + 1} / ${count}`);
    pagination.previousHitArea.input!.enabled = hasPrevious;
    pagination.nextHitArea.input!.enabled = hasNext;
  }

  function handleCardClick(index: number) {
    const entry = activeEntries()[pageIndex() * itemsPerPage + index];

    if (!entry) {
      return;
    }

    if (entry.kind === "inventory") {
      void args.callbacks.createOffer({
        sellerMint: entry.seller.mint,
        itemId: entry.slot.itemId,
        itemQuantity: 1,
        goldAmount: actionPrice,
      });
      activeTab = "sell";
      render();
      return;
    }

    if (entry.action === "accept") {
      void args.callbacks.acceptOffer(entry.offer.offer);
      return;
    }

    if (entry.action === "cancel") {
      void args.callbacks.cancelOffer(entry.offer.offer);
      return;
    }

    if (entry.action === "finalize") {
      void args.callbacks.finalizeOffer(entry.offer.offer);
    }
  }

  function activeEntries(): TradeListEntry[] {
    if (activeTab === "buy") {
      const seller = selectedTradePartner();

      return seller
        ? seller.inventory.slots.map((slot) => ({
            kind: "inventory",
            slot,
            seller,
          }))
        : [];
    }

    return activeOffers().map((offer) => ({
      kind: "offer",
      offer,
      action: offerAction(offer),
    }));
  }

  function activeOffers() {
    return offers.filter((offer) => offer.status !== "finalized");
  }

  function selectedTradePartner() {
    const selected = players.find(
      (player) => !player.isActive && player.mint === selectedSellerMint
    );

    if (selected) {
      return selected;
    }

    const offer = activeOffers()[0];
    const partnerMint =
      offer?.direction === "outgoing"
        ? offer.sellerPlayerMint
        : offer?.buyerPlayerMint;

    return partnerMint
      ? players.find(
          (player) => !player.isActive && player.mint === partnerMint
        )
      : undefined;
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

  function offerAction(offer: TradeOfferState): TradeOfferAction {
    if (offer.direction === "incoming" && offer.status === "open") {
      return "accept";
    }

    if (offer.direction === "outgoing" && offer.status === "open") {
      return "cancel";
    }

    if (offer.direction === "outgoing" && offer.status === "accepted") {
      return "finalize";
    }

    return null;
  }

  function actionLabel(action: TradeOfferAction) {
    if (action === "accept") {
      return "Accept";
    }

    if (action === "cancel") {
      return "Cancel";
    }

    if (action === "finalize") {
      return "Finish";
    }

    return "...";
  }

  function statusLabel(offer: TradeOfferState) {
    if (offer.status === "accepted") {
      return "Accepted";
    }

    if (offer.direction === "incoming") {
      return "Incoming";
    }

    return "Outgoing";
  }

  function statusColor(offer: TradeOfferState) {
    if (offer.status === "accepted") {
      return "#2f641e";
    }

    return offer.direction === "incoming" ? "#143b59" : "#6b4721";
  }

  function pageIndex() {
    return pageByTab[activeTab];
  }

  function pageCount() {
    return Math.max(1, Math.ceil(activeEntries().length / itemsPerPage));
  }

  function setPage(nextPage: number) {
    pageByTab[activeTab] = Phaser.Math.Clamp(nextPage, 0, pageCount() - 1);
    render();
  }

  function clampPage() {
    pageByTab[activeTab] = Phaser.Math.Clamp(
      pageByTab[activeTab],
      0,
      pageCount() - 1
    );
  }

  function openPanel() {
    container.setVisible(true);
    closedOfferKey = null;
  }

  function closePanel() {
    closedOfferKey = offerKey(offers);
    selectedSellerMint = null;
    container.setVisible(false);
  }

  function containsPanelPoint(x: number, y: number) {
    return x >= 0 && x <= panelWidth && y >= headerY && y <= panelHeight;
  }

  function containsRect(
    x: number,
    y: number,
    rectX: number,
    rectY: number,
    rectWidth: number,
    rectHeight: number
  ) {
    return (
      x >= rectX &&
      x <= rectX + rectWidth &&
      y >= rectY &&
      y <= rectY + rectHeight
    );
  }

  function offerKey(nextOffers: TradeOfferState[]) {
    return nextOffers
      .filter((offer) => offer.status !== "finalized")
      .map((offer) =>
        [
          offer.offer,
          offer.status,
          offer.direction,
          offer.itemId,
          offer.itemQuantity,
          offer.goldAmount.toString(),
        ].join(":")
      )
      .join("|");
  }
};
