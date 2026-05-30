export type PresetKey = "last90" | "thisFY" | "lastFY" | "last12" | "all";

export interface DateRange {
  from?: Date;
  to?: Date;
}

export interface LookupSearchState {
  constituentId: string;
  preset: PresetKey;
  customFrom: string;
  customTo: string;
  channelIds: number[];
  campaignTypeIds: number[];
  statuses: string[];
  countsOnly: boolean;
}

export interface PresetOption {
  key: PresetKey;
  label: string;
}
