import { customFetch } from "@workspace/api-client-react";
import type { LookupSearchState } from "./shared-types";

export interface SavedConstituentSearch {
  id: number;
  name: string;
  searchState: LookupSearchState;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SavedConstituentSearchInput {
  name: string;
  searchState: LookupSearchState;
  isFavorite?: boolean;
}

export interface SavedConstituentSearchUpdate {
  name?: string;
  searchState?: LookupSearchState;
  isFavorite?: boolean;
}

export function listSavedConstituentSearches(): Promise<SavedConstituentSearch[]> {
  return customFetch<SavedConstituentSearch[]>("/saved-constituent-searches", {
    method: "GET",
    responseType: "json",
  });
}

export function createSavedConstituentSearch(
  input: SavedConstituentSearchInput,
): Promise<SavedConstituentSearch> {
  return customFetch<SavedConstituentSearch>("/saved-constituent-searches", {
    method: "POST",
    body: JSON.stringify(input),
    responseType: "json",
  });
}

export function updateSavedConstituentSearch(
  id: number,
  input: SavedConstituentSearchUpdate,
): Promise<SavedConstituentSearch> {
  return customFetch<SavedConstituentSearch>(`/saved-constituent-searches/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
    responseType: "json",
  });
}

export function deleteSavedConstituentSearch(id: number): Promise<void> {
  return customFetch<void>(`/saved-constituent-searches/${id}`, {
    method: "DELETE",
  });
}
