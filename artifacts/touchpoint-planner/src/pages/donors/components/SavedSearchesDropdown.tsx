import { Bookmark, Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useSavedConstituentSearches,
  useUpdateSavedConstituentSearch,
  useDeleteSavedConstituentSearch,
} from "../hooks/useSavedConstituentSearches";
import type { LookupSearchState } from "../shared-types";

interface SavedSearchesDropdownProps {
  onLoad: (searchState: LookupSearchState) => void;
}

export function SavedSearchesDropdown({ onLoad }: SavedSearchesDropdownProps) {
  const { data: searches = [], isLoading } = useSavedConstituentSearches();
  const updateMutation = useUpdateSavedConstituentSearch();
  const deleteMutation = useDeleteSavedConstituentSearch();

  if (isLoading) {
    return (
      <Button variant="outline" size="sm" className="h-8 gap-1.5" disabled>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Saved Searches
      </Button>
    );
  }

  if (searches.length === 0) {
    return (
      <Button variant="outline" size="sm" className="h-8 gap-1.5" disabled>
        <Bookmark className="h-3.5 w-3.5" />
        No Saved Searches
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {searches.map((search) => (
        <div key={search.id} className="flex items-center rounded-md border bg-card">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-r-none px-2 text-sm"
            onClick={() => onLoad(search.searchState)}
            title={`Load ${search.name}`}
          >
            {search.isFavorite ? <Star className="mr-1.5 h-3.5 w-3.5 fill-current" /> : null}
            {search.name}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-none px-2 text-muted-foreground"
            onClick={() =>
              updateMutation.mutate({
                id: search.id,
                input: { isFavorite: !search.isFavorite },
              })
            }
            title={search.isFavorite ? "Remove favorite" : "Mark favorite"}
          >
            <Star className={search.isFavorite ? "h-3.5 w-3.5 fill-current" : "h-3.5 w-3.5"} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-l-none px-2 text-muted-foreground"
            onClick={() => {
              if (window.confirm(`Delete saved search \"${search.name}\"?`)) {
                deleteMutation.mutate(search.id);
              }
            }}
            title="Delete saved search"
          >
            ×
          </Button>
        </div>
      ))}
    </div>
  );
}
