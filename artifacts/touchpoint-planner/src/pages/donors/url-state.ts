import type { LookupSearchState, PresetKey } from "./shared-types";

export function parseConstituentLookupSearch(search: string): LookupSearchState {
  const params = new URLSearchParams(search);

  return {
    constituentId: params.get("id") ?? "",
    preset: (params.get("preset") ?? "thisFY") as PresetKey,
    customFrom: params.get("from") ?? "",
    customTo: params.get("to") ?? "",
    channelIds: params.getAll("ch").map(Number).filter(Boolean),
    campaignTypeIds: params.getAll("ct").map(Number).filter(Boolean),
    statuses: params.getAll("st").filter(Boolean),
    countsOnly: params.get("threshold") === "1",
  };
}

export function buildConstituentLookupSearch(state: LookupSearchState): string {
  const params = new URLSearchParams();

  if (state.constituentId) params.set("id", state.constituentId);
  if (state.preset !== "thisFY") params.set("preset", state.preset);
  if (state.customFrom) params.set("from", state.customFrom);
  if (state.customTo) params.set("to", state.customTo);

  state.channelIds.forEach((id) => params.append("ch", String(id)));
  state.campaignTypeIds.forEach((id) => params.append("ct", String(id)));
  state.statuses.forEach((status) => params.append("st", status));
  if (state.countsOnly) params.set("threshold", "1");

  return params.toString() ? `?${params}` : "";
}
