import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";

/**
 * Global keyboard shortcuts. We avoid single-letter bindings that would clash
 * with text input. The "g <letter>" leader pattern requires two key presses
 * within 1.2s, so users typing in a field never trigger a navigation by
 * accident — `g` alone in an input does nothing here.
 */
const LEADER_TIMEOUT_MS = 1200;

function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (t.isContentEditable) return true;
  return false;
}

export function useKeyboardShortcuts(): {
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
} {
  const [, setLocation] = useLocation();
  const [helpOpen, setHelpOpen] = useState(false);
  const [leader, setLeader] = useState<"g" | null>(null);

  useEffect(() => {
    if (!leader) return;
    const t = window.setTimeout(() => setLeader(null), LEADER_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [leader]);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      // Ignore when typing in inputs or when modifier keys are held.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;

      const k = e.key;

      // "?" opens help (Shift+/ on US keyboards).
      if (k === "?") {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }

      if (leader === "g") {
        if (k === "d") { e.preventDefault(); setLocation("/"); setLeader(null); return; }
        if (k === "r") { e.preventDefault(); setLocation("/reports"); setLeader(null); return; }
        if (k === "c") { e.preventDefault(); setLocation("/campaigns"); setLeader(null); return; }
        if (k === "u") { e.preventDefault(); setLocation("/donors"); setLeader(null); return; }
        if (k === "a") { e.preventDefault(); setLocation("/audit"); setLeader(null); return; }
        if (k === "e") { e.preventDefault(); setLocation("/exports"); setLeader(null); return; }
        // Any other key cancels the leader.
        setLeader(null);
        return;
      }

      if (k === "g") {
        // Don't preventDefault — typing 'g' in non-editable areas is harmless.
        setLeader("g");
      }
    },
    [leader, setLocation],
  );

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  return { helpOpen, setHelpOpen };
}

interface ShortcutHelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutHelpDialog({ open, onOpenChange }: ShortcutHelpDialogProps) {
  const rows: Array<{ keys: string[]; label: string }> = [
    { keys: ["?"], label: "Show this help" },
    { keys: ["g", "d"], label: "Go to Dashboard" },
    { keys: ["g", "c"], label: "Go to Campaigns" },
    { keys: ["g", "r"], label: "Go to Reports" },
    { keys: ["g", "u"], label: "Go to Constituents" },
    { keys: ["g", "e"], label: "Go to Exports" },
    { keys: ["g", "a"], label: "Go to Audit log" },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Press the leader <Kbd>g</Kbd> followed by another key to navigate.
            Shortcuts are disabled while you are typing in a field.
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-y rounded-md border" role="list">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>{r.label}</span>
              <span className="flex items-center gap-1">
                {r.keys.map((k, i) => (
                  <Kbd key={`${r.label}-${i}`}>{k}</Kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
