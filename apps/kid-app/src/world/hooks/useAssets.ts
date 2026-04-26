import { useReducer } from "react";

export type AssetState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

export type AssetEvent =
  | { type: "START" }
  | { type: "COMPLETE" }
  | { type: "FAIL"; message: string }
  | { type: "RESET" };

export const initial: AssetState = { status: "idle" };

export function reduce(state: AssetState, event: AssetEvent): AssetState {
  switch (event.type) {
    case "RESET":
      return initial;
    case "START":
      if (state.status === "idle") return { status: "loading" };
      return state;
    case "COMPLETE":
      if (state.status === "loading") return { status: "ready" };
      return state;
    case "FAIL":
      if (state.status === "loading") return { status: "error", message: event.message };
      return state;
    default:
      return state;
  }
}

/** React hook wrapper around the reducer. Used by the LoadingScreen + App. */
export function useAssets() {
  const [state, dispatch] = useReducer(reduce, initial);
  return {
    state,
    start: () => dispatch({ type: "START" }),
    complete: () => dispatch({ type: "COMPLETE" }),
    fail: (message: string) => dispatch({ type: "FAIL", message }),
    reset: () => dispatch({ type: "RESET" }),
  };
}
