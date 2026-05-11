import { useEffect, useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  validatePasswordSetupToken,
  completePasswordSetup,
  type PasswordSetupTokenInfo,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { PasswordStrengthMeter, evaluatePasswordStrength } from "@/components/password-strength";

const schema = z
  .object({
    newPassword: z.string().min(12, "Must be at least 12 characters"),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export default function SetupPassword() {
  const [, params] = useRoute("/setup-password/:token");
  const token = params?.token ?? "";
  const [, setLocation] = useLocation();

  const [info, setInfo] = useState<PasswordSetupTokenInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    validatePasswordSetupToken(token)
      .then((res) => {
        if (cancelled) return;
        setInfo(res);
      })
      .catch((err: any) => {
        if (cancelled) return;
        const msg =
          err?.data?.error ??
          err?.response?.data?.error ??
          "This link is invalid or has expired.";
        setLoadError(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });
  const newPw = form.watch("newPassword");
  const strength = evaluatePasswordStrength({
    password: newPw,
    email: info?.email,
    name: info?.name,
  });

  const onSubmit = async (data: z.infer<typeof schema>) => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      await completePasswordSetup(token, { newPassword: data.newPassword });
      setDone(true);
      setTimeout(() => setLocation("/login"), 1500);
    } catch (err: any) {
      setSubmitError(
        err?.data?.error ??
          err?.response?.data?.error ??
          "Could not set your password. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg border p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="h-12 w-12 bg-primary mx-auto rounded flex items-center justify-center mb-4">
            <span className="text-primary-foreground font-bold text-xl leading-none tracking-tighter">NC</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            {info?.kind === "reset" ? "Choose a new password" : "Set up your password"}
          </h1>
          {info && (
            <p className="text-sm text-muted-foreground">
              Setting password for <strong>{info.email}</strong>
            </p>
          )}
        </div>

        {loading && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {!loading && loadError && (
          <div className="space-y-4">
            <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Link unavailable</p>
                <p>{loadError}</p>
              </div>
            </div>
            <div className="text-center text-sm space-x-3">
              <Link href="/forgot-password" className="text-primary hover:underline">
                Request a new link
              </Link>
              <span className="text-muted-foreground">·</span>
              <Link href="/login" className="text-primary hover:underline">
                Back to sign in
              </Link>
            </div>
          </div>
        )}

        {done && (
          <div className="bg-emerald-50 text-emerald-800 p-4 rounded-md text-sm flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            Password set. Redirecting to sign in…
          </div>
        )}

        {!loading && !loadError && !done && info && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {submitError && (
                <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <Label>New password</Label>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} data-testid="input-new-password" />
                    </FormControl>
                    <FormMessage />
                    <PasswordStrengthMeter
                      password={field.value}
                      email={info.email}
                      name={info.name}
                    />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <Label>Confirm password</Label>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} data-testid="input-confirm-password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={submitting || !strength.meetsPolicy}
                data-testid="button-submit-set-password"
              >
                {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Set password"}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Link expires {new Date(info.expiresAt).toLocaleString()}.
              </p>
            </form>
          </Form>
        )}
      </div>
    </div>
  );
}
