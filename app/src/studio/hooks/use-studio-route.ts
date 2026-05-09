import { useEffect, useState } from "react";

import { ROUTES } from "../lib/studio-data";
import type { StudioRouteId } from "../lib/studio-types";

export function useStudioRoute() {
  const readRoute = () => {
    const route = window.location.hash.replace("#", "") as StudioRouteId;
    return ROUTES[route] ? route : "dashboard";
  };
  const [route, setRouteState] = useState<StudioRouteId>(readRoute);

  useEffect(() => {
    const onHashChange = () => setRouteState(readRoute());

    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const setRoute = (nextRoute: StudioRouteId) => {
    window.history.replaceState(null, "", `#${nextRoute}`);
    setRouteState(nextRoute);
  };

  return [route, setRoute] as const;
}
