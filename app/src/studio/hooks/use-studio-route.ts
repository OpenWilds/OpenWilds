import { useEffect, useState } from "react";

import { ROUTES } from "../lib/studio-data";
import type { StudioRouteId } from "../lib/studio-types";

const ROUTE_PATHS: Record<StudioRouteId, string> = {
  dashboard: "/studio",
  textures: "/studio/textures",
  plants: "/studio/plants",
  objects: "/studio/objects",
  map: "/studio/worlds",
  assets: "/studio/assets",
};

const PATH_ROUTES = Object.fromEntries(
  Object.entries(ROUTE_PATHS).map(([route, path]) => [path, route])
) as Record<string, StudioRouteId>;

export function useStudioRoute() {
  const readRoute = () => {
    const pathname = window.location.pathname.replace(/\/$/, "") || "/";
    const pathRoute = PATH_ROUTES[pathname];
    if (pathRoute) {
      return pathRoute;
    }

    const route = window.location.hash.replace("#", "") as StudioRouteId;
    return ROUTES[route] ? route : "dashboard";
  };
  const [route, setRouteState] = useState<StudioRouteId>(readRoute);

  useEffect(() => {
    const onRouteChange = () => setRouteState(readRoute());

    window.addEventListener("hashchange", onRouteChange);
    window.addEventListener("popstate", onRouteChange);
    return () => {
      window.removeEventListener("hashchange", onRouteChange);
      window.removeEventListener("popstate", onRouteChange);
    };
  }, []);

  const setRoute = (nextRoute: StudioRouteId) => {
    window.history.pushState(null, "", ROUTE_PATHS[nextRoute]);
    setRouteState(nextRoute);
  };

  return [route, setRoute] as const;
}
