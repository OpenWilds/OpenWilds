import type Phaser from "phaser";
import actionButtonBgUrl from "./ui/actionButton_bg.png?url";
import actionProgressBarFillerUrl from "./ui/actionprogress_barfiller.png?url";
import actionProgressBarTrackUrl from "./ui/actionprogress_bartrack.png?url";
import actionProgressIconContainerUrl from "./ui/actionprogress_iconcontainer.png?url";
import dateTimeArtworkUrl from "./ui/datetime_artwork.png?url";
import dateTimeHalfcircleFrameUrl from "./ui/datetime_halfcircleframe.png?url";
import dateTimePanelUrl from "./ui/datetime_panel.png?url";
import energyBarBarUrl from "./ui/energybar_bar.png?url";
import energyBarFillerUrl from "./ui/energybar_filler.png?url";
import energyBarIconUrl from "./ui/energybar_icon.png?url";
import inventoryDividerUrl from "./ui/inventory_divider.png?url";
import inventoryPanelUrl from "./ui/inventory_panel.png?url";
import inventorySlotHoverUrl from "./ui/inventory_slot_hover.png?url";
import inventorySlotSelectedUrl from "./ui/inventory_slot_selected.png?url";
import inventorySlotUrl from "./ui/inventory_slot.png?url";
import journalActiveUrl from "./ui/journal_active.png?url";
import journalInactiveUrl from "./ui/Journal_inactive.png?url";
import mapActiveUrl from "./ui/map_active.png?url";
import mapInactiveUrl from "./ui/map_inactive.png?url";
import minimapFrameUrl from "./ui/minimap_frame_default.png?url";
import playerMarkerUrl from "./ui/player_marker.png?url";
import settingsActiveUrl from "./ui/settings_active.png?url";
import settingsInactiveUrl from "./ui/settings_inactive.png?url";
import toastCardPanelUrl from "./ui/toastcard_panel.png?url";
import panelCloseButtonUrl from "./ui/panel/close button.png?url";
import panelHeaderUrl from "./ui/panel/header.png?url";
import panelItemsGridPanelUrl from "./ui/panel/items_grid_panel.png?url";
import panelItemsGridPanelBuyUrl from "./ui/panel/items_grid_panel_buy.png?url";
import panelItemsGridPanelSellUrl from "./ui/panel/items_grid_panel_sell.png?url";
import panelPaginationButtonNextActiveUrl from "./ui/panel/pagination_button_next_active.png?url";
import panelPaginationButtonNextInactiveUrl from "./ui/panel/pagination_button_next_inactive.png?url";
import panelPaginationButtonPrevActiveUrl from "./ui/panel/pagination_button_prev_active.png?url";
import panelPaginationButtonPrevInactiveUrl from "./ui/panel/pagination_button_prev_inactive.png?url";
import panelPaginationPanelUrl from "./ui/panel/pagination_panel.png?url";
import panelTabLabelActiveBlueUrl from "./ui/panel/panel_tab_label_active_blue.png?url";
import panelTabLabelActiveGreenUrl from "./ui/panel/panel_tab_label_active_green.png?url";
import panelTabLabelInactiveUrl from "./ui/panel/panel_tab_label_inactive.png?url";
import panelTabStandUrl from "./ui/panel/panel_tab_stand.png?url";
import panelUrl from "./ui/panel/panel.png?url";
import iconAxeUrl from "./ui/Icons/axe.png?url";
import iconDigUrl from "./ui/Icons/dig.png?url";
import iconDropUrl from "./ui/Icons/drop.png?url";
import iconForageUrl from "./ui/Icons/forage.png?url";
import iconGrabUrl from "./ui/Icons/grab.png?url";
import iconHandsUrl from "./ui/Icons/hands.png?url";
import iconHarvestUrl from "./ui/Icons/harvest.png?url";
import iconPlantUrl from "./ui/Icons/plant.png?url";
import iconSettingsUrl from "./ui/Icons/settings.png?url";
import iconSleepUrl from "./ui/Icons/sleep.png?url";
import iconWateringCanUrl from "./ui/Icons/watering_can.png?url";

export const UI_ASSETS = {
  actionButtonBg: { key: "ui-action-button-bg", url: actionButtonBgUrl },
  actionProgressBarFiller: {
    key: "ui-action-progress-bar-filler",
    url: actionProgressBarFillerUrl,
  },
  actionProgressBarTrack: {
    key: "ui-action-progress-bar-track",
    url: actionProgressBarTrackUrl,
  },
  actionProgressIconContainer: {
    key: "ui-action-progress-icon-container",
    url: actionProgressIconContainerUrl,
  },
  dateTimeArtwork: { key: "ui-datetime-artwork", url: dateTimeArtworkUrl },
  dateTimeHalfcircleFrame: {
    key: "ui-datetime-halfcircle-frame",
    url: dateTimeHalfcircleFrameUrl,
  },
  dateTimePanel: { key: "ui-datetime-panel", url: dateTimePanelUrl },
  energyBarBar: { key: "ui-energybar-bar", url: energyBarBarUrl },
  energyBarFiller: { key: "ui-energybar-filler", url: energyBarFillerUrl },
  energyBarIcon: { key: "ui-energybar-icon", url: energyBarIconUrl },
  inventoryDivider: { key: "ui-inventory-divider", url: inventoryDividerUrl },
  inventoryPanel: { key: "ui-inventory-panel", url: inventoryPanelUrl },
  inventorySlot: { key: "ui-inventory-slot", url: inventorySlotUrl },
  inventorySlotHover: {
    key: "ui-inventory-slot-hover",
    url: inventorySlotHoverUrl,
  },
  inventorySlotSelected: {
    key: "ui-inventory-slot-selected",
    url: inventorySlotSelectedUrl,
  },
  journalActive: { key: "ui-journal-active", url: journalActiveUrl },
  journalInactive: { key: "ui-journal-inactive", url: journalInactiveUrl },
  mapActive: { key: "ui-map-active", url: mapActiveUrl },
  mapInactive: { key: "ui-map-inactive", url: mapInactiveUrl },
  minimapFrame: { key: "ui-minimap-frame", url: minimapFrameUrl },
  playerMarker: { key: "ui-player-marker", url: playerMarkerUrl },
  panel: { key: "ui-panel", url: panelUrl },
  panelCloseButton: { key: "ui-panel-close-button", url: panelCloseButtonUrl },
  panelHeader: { key: "ui-panel-header", url: panelHeaderUrl },
  panelItemsGridPanel: {
    key: "ui-panel-items-grid-panel",
    url: panelItemsGridPanelUrl,
  },
  panelItemsGridPanelBuy: {
    key: "ui-panel-items-grid-panel-buy",
    url: panelItemsGridPanelBuyUrl,
  },
  panelItemsGridPanelSell: {
    key: "ui-panel-items-grid-panel-sell",
    url: panelItemsGridPanelSellUrl,
  },
  panelPaginationButtonNextActive: {
    key: "ui-panel-pagination-button-next-active",
    url: panelPaginationButtonNextActiveUrl,
  },
  panelPaginationButtonNextInactive: {
    key: "ui-panel-pagination-button-next-inactive",
    url: panelPaginationButtonNextInactiveUrl,
  },
  panelPaginationButtonPrevActive: {
    key: "ui-panel-pagination-button-prev-active",
    url: panelPaginationButtonPrevActiveUrl,
  },
  panelPaginationButtonPrevInactive: {
    key: "ui-panel-pagination-button-prev-inactive",
    url: panelPaginationButtonPrevInactiveUrl,
  },
  panelPaginationPanel: {
    key: "ui-panel-pagination-panel",
    url: panelPaginationPanelUrl,
  },
  panelTabLabelActiveBlue: {
    key: "ui-panel-tab-label-active-blue",
    url: panelTabLabelActiveBlueUrl,
  },
  panelTabLabelActiveGreen: {
    key: "ui-panel-tab-label-active-green",
    url: panelTabLabelActiveGreenUrl,
  },
  panelTabLabelInactive: {
    key: "ui-panel-tab-label-inactive",
    url: panelTabLabelInactiveUrl,
  },
  panelTabStand: { key: "ui-panel-tab-stand", url: panelTabStandUrl },
  settingsActive: { key: "ui-settings-active", url: settingsActiveUrl },
  settingsInactive: { key: "ui-settings-inactive", url: settingsInactiveUrl },
  toastCardPanel: { key: "ui-toast-card-panel", url: toastCardPanelUrl },
} as const;

export const UI_ICONS = {
  axe: { key: "ui-icon-axe", url: iconAxeUrl },
  dig: { key: "ui-icon-dig", url: iconDigUrl },
  drop: { key: "ui-icon-drop", url: iconDropUrl },
  forage: { key: "ui-icon-forage", url: iconForageUrl },
  grab: { key: "ui-icon-grab", url: iconGrabUrl },
  hands: { key: "ui-icon-hands", url: iconHandsUrl },
  harvest: { key: "ui-icon-harvest", url: iconHarvestUrl },
  plant: { key: "ui-icon-plant", url: iconPlantUrl },
  settings: { key: "ui-icon-settings", url: iconSettingsUrl },
  sleep: { key: "ui-icon-sleep", url: iconSleepUrl },
  wateringCan: { key: "ui-icon-watering-can", url: iconWateringCanUrl },
} as const;

export const loadUiAssets = (scene: Phaser.Scene) => {
  Object.values(UI_ASSETS).forEach((asset) => {
    scene.load.image(asset.key, asset.url);
  });
  Object.values(UI_ICONS).forEach((asset) => {
    scene.load.image(asset.key, asset.url);
  });
};
