import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSavedConstituentSearch,
  deleteSavedConstituentSearch,
  listSavedConstituentSearches,
  updateSavedConstituentSearch,
  type SavedConstituentSearchInput,
  type SavedConstituentSearchUpdate,
} from "../saved-searches-api";

export const savedConstituentSearchesQueryKey = ["saved-constituent-searches"] as const;

export function useSavedConstituentSearches() {
  return useQuery({
    queryKey: savedConstituentSearchesQueryKey,
    queryFn: listSavedConstituentSearches,
  });
}

export function useCreateSavedConstituentSearch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SavedConstituentSearchInput) => createSavedConstituentSearch(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: savedConstituentSearchesQueryKey });
    },
  });
}

export function useUpdateSavedConstituentSearch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: SavedConstituentSearchUpdate }) =>
      updateSavedConstituentSearch(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: savedConstituentSearchesQueryKey });
    },
  });
}

export function useDeleteSavedConstituentSearch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => deleteSavedConstituentSearch(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: savedConstituentSearchesQueryKey });
    },
  });
}
