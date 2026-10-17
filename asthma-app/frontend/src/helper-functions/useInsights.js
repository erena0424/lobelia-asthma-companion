import { useEffect, useState } from "react";
import { getInsights } from "./insights";
import { localYmd } from "./forecastDisplayLogic";

export function useInsights(token, days) {
  const [state, setState] = useState({ status: "loading", data: null });

  useEffect(() => {
    let cancelled = false;
    if (!token) return undefined;
    getInsights({ token, days, today: localYmd() })
      .then((data) => !cancelled && setState({ status: "success", data }))
      .catch(() => !cancelled && setState({ status: "error", data: null }));
    return () => {
      cancelled = true;
    };
  }, [token, days]);

  return state;
}
