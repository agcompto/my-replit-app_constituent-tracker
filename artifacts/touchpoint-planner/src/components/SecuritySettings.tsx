import { useState } from "react";
import {
  useGetTotpStatus,
  useStartTotpEnrollment,
  useVerifyTotpEnrollment,
  useDisableTotp,
  useRegenerateTotpRecoveryCodes,
  getGetTotpStatusQueryKey,
  getGetMeQueryKey,
  ApiError,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, Copy, Download, Loader2, RotateCw, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ReauthDialog, isReauthRequired } from "@/components/ReauthDialog";

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    const data = e.data as { error?: string } | null;
    if (data?.error) return data.error;
  }
  return fallback;
}

function downloadRecoveryCodes(codes: string[]): void {
  const body = [
    "NCSU Advancement Touchpoint Planner",
    "Two-factor recovery codes",
    `Generated: ${new Date().toISOString()}`,
    "",
    "Each code can be used once instead of an authenticator code.",
    "Store this file in a password manager and delete from disk.",
    "",
    ...codes,
    "",
  ].join("\n");
  const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ctp-recovery-codes-${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Security tab content for the Settings page. Shows TOTP enrollment status
 * and exposes enroll / regenerate-recovery-codes / disable actions.
 *
 * Disable is hidden for admin/super_admin (those roles cannot self-disable
 * — they must ask another super_admin to reset). Recovery codes are shown
 * exactly once; if the user dismisses the dialog they must regenerate to
 * see codes again.
 */
export function SecuritySettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: status, isLoading } = useGetTotpStatus();

  const startEnroll = useStartTotpEnrollment();
  const verifyEnroll = useVerifyTotpEnrollment();
  const disable = useDisableTotp();
  const regen = useRegenerateTotpRecoveryCodes();

  const [enrollState, setEnrollState] = useState<
    | { kind: "idle" }
    | { kind: "started"; otpauthUri: string; qrDataUrl: string; secret: string }
  >({ kind: "idle" });
  const [enrollCode, setEnrollCode] = useState("");
  const [shownCodes, setShownCodes] = useState<string[] | null>(null);
  const [confirmDisable, setConfirmDisable] = useState(false);

  // Reauth-required handling: enroll-start, regenerate, and disable can all
  // throw 403/`reauth_required`. Track which action we should retry.
  const [reauthRetry, setReauthRetry] = useState<null | "enroll" | "regen" | "disable">(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetTotpStatusQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
  };

  const handleStartEnroll = () => {
    startEnroll.mutate(
      undefined,
      {
        onSuccess: (resp) =>
          setEnrollState({
            kind: "started",
            otpauthUri: resp.otpauthUri,
            qrDataUrl: resp.qrDataUrl,
            secret: resp.secret,
          }),
        onError: (err) => {
          if (isReauthRequired(err)) {
            setReauthRetry("enroll");
          } else {
            toast({
              title: "Could not start enrollment",
              description: errMsg(err, "Unknown error"),
              variant: "destructive",
            });
          }
        },
      },
    );
  };

  const handleVerifyEnroll = () => {
    verifyEnroll.mutate(
      { data: { code: enrollCode.trim() } },
      {
        onSuccess: (resp) => {
          setShownCodes(resp.recoveryCodes);
          setEnrollState({ kind: "idle" });
          setEnrollCode("");
          invalidate();
          toast({ title: "Two-factor authentication enabled" });
        },
        onError: (err) => {
          toast({
            title: "Verification failed",
            description: errMsg(err, "That code didn't work."),
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleRegen = () => {
    regen.mutate(
      undefined,
      {
        onSuccess: (resp) => {
          setShownCodes(resp.recoveryCodes);
          invalidate();
        },
        onError: (err) => {
          if (isReauthRequired(err)) {
            setReauthRetry("regen");
          } else {
            toast({
              title: "Could not regenerate recovery codes",
              description: errMsg(err, "Unknown error"),
              variant: "destructive",
            });
          }
        },
      },
    );
  };

  const handleDisable = () => {
    disable.mutate(
      undefined,
      {
        onSuccess: () => {
          setConfirmDisable(false);
          invalidate();
          toast({ title: "Two-factor authentication disabled" });
        },
        onError: (err) => {
          if (isReauthRequired(err)) {
            setReauthRetry("disable");
          } else {
            toast({
              title: "Could not disable two-factor",
              description: errMsg(err, "Unknown error"),
              variant: "destructive",
            });
          }
        },
      },
    );
  };

  const onReauthSuccess = () => {
    const which = reauthRetry;
    setReauthRetry(null);
    if (which === "enroll") handleStartEnroll();
    else if (which === "regen") handleRegen();
    else if (which === "disable") handleDisable();
  };

  if (isLoading || !status) {
    return <Loader2 className="animate-spin h-5 w-5" />;
  }

  const enrolled = status.enrolled;
  const required = status.required;
  const lowRecovery = enrolled && status.unusedRecoveryCodes <= 3;

  return (
    <Card data-testid="security-settings-root">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" /> Two-factor authentication
        </CardTitle>
        <CardDescription>
          Use a TOTP authenticator app (Google Authenticator, 1Password, Authy, etc.)
          for a second factor at sign-in.
          {required && " Your role requires two-factor authentication — it cannot be turned off."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between border rounded-md p-3">
          <div>
            <Label className="text-base">Status</Label>
            <p className="text-xs text-muted-foreground">
              {enrolled
                ? `Enrolled${status.enrolledAt ? ` on ${new Date(status.enrolledAt).toLocaleDateString()}` : ""}.`
                : "Not enrolled."}
            </p>
          </div>
          {enrolled ? (
            <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">Enrolled</Badge>
          ) : (
            <Badge variant="secondary">Not enrolled</Badge>
          )}
        </div>

        {enrolled && (
          <div className="flex items-center justify-between border rounded-md p-3">
            <div>
              <Label className="text-base">Recovery codes remaining</Label>
              <p className="text-xs text-muted-foreground">
                Each recovery code can be used once instead of an authenticator
                code. Regenerating invalidates any unused codes.
              </p>
            </div>
            <Badge variant={lowRecovery ? "destructive" : "outline"}>
              {status.unusedRecoveryCodes} / 10
            </Badge>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          {!enrolled && (
            <Button
              onClick={handleStartEnroll}
              disabled={startEnroll.isPending}
              data-testid="button-totp-enroll"
            >
              {startEnroll.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Set up two-factor
            </Button>
          )}
          {enrolled && (
            <Button
              variant="outline"
              onClick={handleStartEnroll}
              disabled={startEnroll.isPending}
              data-testid="button-totp-reenroll"
            >
              {startEnroll.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RotateCw className="h-4 w-4 mr-2" />
              )}
              Reset / re-enroll authenticator
            </Button>
          )}
          {enrolled && (
            <Button
              variant="outline"
              onClick={handleRegen}
              disabled={regen.isPending}
              data-testid="button-regen-recovery"
            >
              {regen.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Regenerate recovery codes
            </Button>
          )}
          {enrolled && !required && (
            <Button
              variant="destructive"
              onClick={() => setConfirmDisable(true)}
              data-testid="button-totp-disable"
            >
              Disable two-factor
            </Button>
          )}
        </div>
      </CardContent>

      {/* Enroll dialog */}
      <Dialog
        open={enrollState.kind === "started"}
        onOpenChange={(v) => {
          if (!v) {
            setEnrollState({ kind: "idle" });
            setEnrollCode("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set up two-factor authentication</DialogTitle>
            <DialogDescription>
              Scan this QR code with your authenticator app, then enter the
              6-digit code to confirm.
            </DialogDescription>
          </DialogHeader>
          {enrollState.kind === "started" && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <img
                  src={enrollState.qrDataUrl}
                  alt="Authenticator QR code"
                  className="border rounded bg-white"
                  width={200}
                  height={200}
                />
              </div>
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Can't scan? Enter the secret manually</summary>
                <code className="block break-all bg-muted p-2 rounded font-mono text-[11px] mt-2">
                  {enrollState.secret}
                </code>
              </details>
              <div className="space-y-2">
                <Label>6-digit code</Label>
                <Input
                  value={enrollCode}
                  onChange={(e) => setEnrollCode(e.target.value)}
                  placeholder="123 456"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  data-testid="input-totp-settings-enroll-code"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setEnrollState({ kind: "idle" });
                setEnrollCode("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleVerifyEnroll}
              disabled={verifyEnroll.isPending || enrollCode.trim().length === 0}
            >
              {verifyEnroll.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recovery codes display (shown after enroll or regen) */}
      <Dialog open={!!shownCodes} onOpenChange={(v) => !v && setShownCodes(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save your recovery codes</DialogTitle>
            <DialogDescription>
              Store these in a password manager. Each code can be used once if
              you lose your authenticator app. They will not be shown again.
            </DialogDescription>
          </DialogHeader>
          {shownCodes && (
            <div className="space-y-3">
              <div
                className="grid grid-cols-2 gap-2 bg-muted p-3 rounded font-mono text-sm"
                data-testid="recovery-codes"
              >
                {shownCodes.map((c) => (
                  <div key={c}>{c}</div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={() => navigator.clipboard?.writeText(shownCodes.join("\n"))}
                >
                  <Copy className="h-4 w-4 mr-2" /> Copy all
                </Button>
                <Button
                  variant="outline"
                  onClick={() => downloadRecoveryCodes(shownCodes)}
                  data-testid="button-download-recovery"
                >
                  <Download className="h-4 w-4 mr-2" /> Download .txt
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShownCodes(null)}>I've saved them</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disable confirmation */}
      <Dialog open={confirmDisable} onOpenChange={setConfirmDisable}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> Disable two-factor authentication?
            </DialogTitle>
            <DialogDescription>
              Your account will rely on a password alone. You can re-enroll at any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDisable(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDisable} disabled={disable.isPending}>
              {disable.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Disable"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReauthDialog
        open={reauthRetry !== null}
        onClose={() => setReauthRetry(null)}
        onSuccess={onReauthSuccess}
        description="Confirm your password to change your two-factor settings."
      />
    </Card>
  );
}
