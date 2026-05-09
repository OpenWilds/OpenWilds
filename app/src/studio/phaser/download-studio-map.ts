import type { StudioMapExport } from "./studio-scene";

export const downloadStudioMap = (map: StudioMapExport) => {
  const blob = new Blob([JSON.stringify(map, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = `open-wilds-map-${map.width}x${map.height}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};
