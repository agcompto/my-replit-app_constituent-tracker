import { useState } from "react";
import { BookmarkPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreateSavedConstituentSearch } from "../hooks/useSavedConstituentSearches";

interface SaveSearchButtonProps {
  searchState: Record<string, unknown>;
}

export function SaveSearchButton({ searchState }: SaveSearchButtonProps) {
  const [saving, setSaving] = useState(false);
  const createMutation = useCreateSavedConstituentSearch();

  async function handleClick() {
    const name = window.prompt("Save search as:");
    if (!name?.trim()) return;

    try {
      setSaving(true);
      await createMutation.mutateAsync({
        name: name.trim(),
        searchState,
      });
      window.alert("Search saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={handleClick} disabled={saving}>
      <BookmarkPlus className="h-3.5 w-3.5" />
      Save Search
    </Button>
  );
}
