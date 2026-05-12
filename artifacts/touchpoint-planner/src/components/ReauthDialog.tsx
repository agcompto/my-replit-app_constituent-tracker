import { useEffect, useState } from "react";
import { useReauth } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Loader2 } from "lucide-react";

/**
 * Returns true if the given mutation/query error is a `requireRecentAuth`
 * 403 from the API. The frontend uses this to detect "please re-enter your
 * password" responses on destructive actions and pop the ReauthDialog.
 */
export function isReauthRequired(error: unknown): boolean {
  const e = error as
    | { status?: number; data?: { code?: string }; response?: { status?: number; data?: { code?: string } } }
    | null
    | undefined;
  const code = e?.data?.code ?? e?.response?.data?.code;
  return code === "reauth_required";
}

/**
 * A modal that asks the user to re-enter their password and POSTs it to
 * `/auth/reauth`. On success, calls `onSuccess()` so the parent can retry
 * whatever destructive action triggered the prompt.
 */
export function ReauthDialog({
  open,
  onClose,
  onSuccess,
  description,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  description?: string;
}) {
  const [password, setPassword] = useState("");
  const mutation = useReauth();

  // Clear the password field whenever the dialog is opened, so a stale
  // value can't leak between consecutive prompts.
  useEffect(() => {
    if (open) {
      setPassword("");
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    mutation.mutate(
      { data: { password } },
      {
        onSuccess: () => {
          setPassword("");
          onSuccess();
        },
      },
    );
  };

  const err = mutation.error as
    | { status?: number; data?: { error?: string }; response?: { status?: number; data?: { error?: string } } }
    | null
    | undefined;
  const status = err?.status ?? err?.response?.status;
  const serverMsg = err?.data?.error ?? err?.response?.data?.error;
  const errorMsg = err
    ? status === 429
      ? serverMsg ?? "Too many failed attempts. Try again later."
      : serverMsg ?? "Incorrect password."
    : null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm your password</DialogTitle>
          <DialogDescription>
            {description ??
              "For your security, please re-enter your password to confirm this action."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {errorMsg && (
            <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="reauth-password">Password</Label>
            <Input
              id="reauth-password"
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="input-reauth-password"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending || !password}
              data-testid="button-reauth-confirm"
            >
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Confirm"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
