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

export interface TouchpointRow {
  campaignId: number;
  campaignName: string;
  campaignStatus: string;
  touchId: number;
  channelId: number;
  channelLabel: string;
  campaignTypeId: number;
  campaignTypeLabel: string;
  sendDate: string;
  countsTowardThreshold: boolean;
}

export type SortCol = "sendDate" | "channelLabel" | "campaignTypeLabel";
export type SortDir = "asc" | "desc";
export interface ConstituentSortState {
  col: SortCol;
  dir: SortDir;
}
