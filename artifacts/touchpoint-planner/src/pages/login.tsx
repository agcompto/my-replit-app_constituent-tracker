import {
  useLogin,
  useLoginTotp,
  useStartTotpEnrollment,
  useVerifyTotpEnrollment,
  getGetMeQueryKey,
  ApiError,
  type LoginOutcome,
  type LoginTotpChallenge,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { AlertTriangle, Loader2, Copy, Check, Download, ShieldCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const totpSchema = z.object({
  code: z
    .string()
    .min(1, "Enter your authenticator code or recovery code")
    .max(20, "Code is too long"),
});

type Step =
  | { kind: "password" }
  | { kind: "totp" }
  | { kind: "enroll"; otpauthUri: string; qrDataUrl: string; secret: string }
  | { kind: "recovery"; codes: string[] };

function downloadRecoveryCodesTxt(codes: string[]): void {
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

function readErr(err: unknown): { status?: number; message?: string } {
  if (err instanceof ApiError) {
    const data = err.data as { error?: string } | null;
    return { status: err.status, message: data?.error };
  }
  return {};
}

function isTotpChallenge(resp: LoginOutcome): resp is LoginTotpChallenge {
  return (resp as LoginTotpChallenge).requiresTotp === true;
}

export default function Login() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>({ kind: "password" });

  const loginMutation = useLogin();
  const loginTotpMutation = useLoginTotp();
  const startEnroll = useStartTotpEnrollment();
  const verifyEnroll = useVerifyTotpEnrollment();

  const passwordForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const totpForm = useForm<z.infer<typeof totpSchema>>({
    resolver: zodResolver(totpSchema),
    defaultValues: { code: "" },
  });
  const enrollForm = useForm<z.infer<typeof totpSchema>>({
    resolver: zodResolver(totpSchema),
    defaultValues: { code: "" },
  });

  const finishLogin = () => {
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    setLocation("/");
  };

  const onSubmitPassword = (data: z.infer<typeof loginSchema>) => {
    loginMutation.mutate(
      { data },
      {
        onSuccess: async (resp) => {
          if (isTotpChallenge(resp)) {
            if (resp.enrollmentRequired) {
              // Kick off enrollment immediately for first-time admin login.
              try {
                const enroll = await startEnroll.mutateAsync();
                setStep({
                  kind: "enroll",
                  otpauthUri: enroll.otpauthUri,
                  qrDataUrl: enroll.qrDataUrl,
                  secret: enroll.secret,
                });
              } catch {
                // Fall through to manual entry; the next-step UI will surface
                // the error from `startEnroll.error`.
                setStep({ kind: "totp" });
              }
            } else {
              setStep({ kind: "totp" });
            }
            return;
          }
          finishLogin();
        },
      },
    );
  };

  const onSubmitTotp = (data: z.infer<typeof totpSchema>) => {
    loginTotpMutation.mutate(
      { data: { code: data.code.trim() } },
      { onSuccess: () => finishLogin() },
    );
  };

  const onSubmitEnrollVerify = (data: z.infer<typeof totpSchema>) => {
    verifyEnroll.mutate(
      { data: { code: data.code.trim() } },
      {
        onSuccess: (resp) => {
          setStep({ kind: "recovery", codes: resp.recoveryCodes });
        },
      },
    );
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg border p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="h-12 w-12 bg-primary mx-auto rounded flex items-center justify-center mb-4">
            <span className="text-primary-foreground font-bold text-xl leading-none tracking-tighter">NC</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Constituent Touchpoint Planner</h1>
          <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">
            NC State University Advancement
          </p>
        </div>

        {step.kind === "password" && (
          <PasswordStep
            form={passwordForm}
            onSubmit={onSubmitPassword}
            error={loginMutation.error}
            isPending={loginMutation.isPending}
          />
        )}

        {step.kind === "totp" && (
          <TotpStep
            form={totpForm}
            onSubmit={onSubmitTotp}
            error={loginTotpMutation.error}
            isPending={loginTotpMutation.isPending}
            onBack={() => {
              setStep({ kind: "password" });
              loginMutation.reset();
              loginTotpMutation.reset();
              passwordForm.reset();
            }}
          />
        )}

        {step.kind === "enroll" && (
          <EnrollStep
            otpauthUri={step.otpauthUri}
            qrDataUrl={step.qrDataUrl}
            secret={step.secret}
            form={enrollForm}
            onSubmit={onSubmitEnrollVerify}
            error={verifyEnroll.error}
            isPending={verifyEnroll.isPending}
          />
        )}

        {step.kind === "recovery" && (
          <RecoveryCodesStep codes={step.codes} onContinue={finishLogin} />
        )}
      </div>
    </div>
  );
}

function ErrorBanner({ error, fallback }: { error: unknown; fallback: string }) {
  if (!error) return null;
  const { status, message } = readErr(error);
  const text =
    status === 429
      ? message ?? "Too many failed attempts. Please try again later."
      : message ?? fallback;
  return (
    <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm flex items-center gap-2">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>{text}</span>
    </div>
  );
}

const SSO_ERROR_MESSAGES: Record<string, string> = {
  not_provisioned:
    "Your account is not provisioned for this application. Contact your administrator.",
  account_disabled:
    "Your account has been deactivated. Contact your administrator.",
};

function useSsoError(): string | null {
  if (typeof window === "undefined") return null;
  const code = new URLSearchParams(window.location.search).get("ssoError");
  if (!code) return null;
  return SSO_ERROR_MESSAGES[code] ?? "Single sign-on failed. Please try again or contact support.";
}

function PasswordStep({
  form,
  onSubmit,
  error,
  isPending,
}: {
  form: ReturnType<typeof useForm<z.infer<typeof loginSchema>>>;
  onSubmit: (d: z.infer<typeof loginSchema>) => void;
  error: unknown;
  isPending: boolean;
}) {
  const ssoError = useSsoError();
  const { data: samlFlag } = useQuery({
    queryKey: ["/api/auth/saml/enabled"],
    queryFn: () => customFetch<{ enabled: boolean }>("/api/auth/saml/enabled"),
    staleTime: 60_000,
  });
  const ssoUrl = `/api/auth/saml/login?returnTo=${encodeURIComponent("/")}`;
  return (
    <>
      {ssoError && (
        <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{ssoError}</span>
        </div>
      )}
      <ErrorBanner error={error} fallback="Failed to log in. Please check your credentials." />
      {samlFlag?.enabled && (
        <div className="space-y-3">
          <Button variant="outline" className="w-full" size="lg" asChild>
            <a href={ssoUrl} data-testid="button-saml-login">
              Sign in with Microsoft
            </a>
          </Button>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-muted-foreground">Or continue with password</span>
            </div>
          </div>
        </div>
      )}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <Label>Email</Label>
                <FormControl>
                  <Input placeholder="Enter your email" type="email" autoComplete="username" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <Label>Password</Label>
                <FormControl>
                  <Input placeholder="Enter your password" type="password" autoComplete="current-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full" size="lg" disabled={isPending}>
            {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : "Sign In"}
          </Button>
          <p className="text-center text-sm">
            <Link href="/forgot-password" className="text-primary hover:underline" data-testid="link-forgot-password">
              Forgot your password?
            </Link>
          </p>
        </form>
      </Form>
    </>
  );
}

function TotpStep({
  form,
  onSubmit,
  error,
  isPending,
  onBack,
}: {
  form: ReturnType<typeof useForm<z.infer<typeof totpSchema>>>;
  onSubmit: (d: z.infer<typeof totpSchema>) => void;
  error: unknown;
  isPending: boolean;
  onBack: () => void;
}) {
  return (
    <>
      <div className="text-center space-y-1">
        <ShieldCheck className="h-6 w-6 text-primary mx-auto" />
        <h2 className="text-lg font-semibold">Two-factor verification</h2>
        <p className="text-xs text-muted-foreground">
          Enter the 6-digit code from your authenticator app, or one of your recovery codes.
        </p>
      </div>
      <ErrorBanner error={error} fallback="That code didn't work. Please try again." />
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <Label>Verification code</Label>
                <FormControl>
                  <Input
                    placeholder="123 456"
                    autoComplete="one-time-code"
                    inputMode="text"
                    autoFocus
                    data-testid="input-totp-code"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full" size="lg" disabled={isPending}>
            {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : "Verify"}
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={onBack}>
            Back
          </Button>
        </form>
      </Form>
    </>
  );
}

function EnrollStep({
  otpauthUri,
  qrDataUrl,
  secret,
  form,
  onSubmit,
  error,
  isPending,
}: {
  otpauthUri: string;
  qrDataUrl: string;
  secret: string;
  form: ReturnType<typeof useForm<z.infer<typeof totpSchema>>>;
  onSubmit: (d: z.infer<typeof totpSchema>) => void;
  error: unknown;
  isPending: boolean;
}) {
  return (
    <>
      <div className="text-center space-y-1">
        <ShieldCheck className="h-6 w-6 text-primary mx-auto" />
        <h2 className="text-lg font-semibold">Set up two-factor authentication</h2>
        <p className="text-xs text-muted-foreground">
          Your role requires a second factor. Scan this code with Google Authenticator,
          1Password, Authy, or any compatible TOTP app, then enter the 6-digit code it shows.
        </p>
      </div>
      <div className="flex justify-center">
        <img
          src={qrDataUrl}
          alt="Authenticator QR code"
          className="border rounded bg-white"
          width={200}
          height={200}
        />
      </div>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Can't scan? Enter the secret manually</summary>
        <div className="mt-2 space-y-2">
          <code className="block break-all bg-muted p-2 rounded font-mono text-[11px]">{secret}</code>
          <p className="break-all">
            Or use this URL: <code className="break-all">{otpauthUri}</code>
          </p>
        </div>
      </details>
      <ErrorBanner error={error} fallback="That code didn't work. Please try again." />
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <Label>Code from your authenticator app</Label>
                <FormControl>
                  <Input
                    placeholder="123 456"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    autoFocus
                    data-testid="input-totp-enroll-code"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full" size="lg" disabled={isPending}>
            {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : "Verify and continue"}
          </Button>
        </form>
      </Form>
    </>
  );
}

function RecoveryCodesStep({ codes, onContinue }: { codes: string[]; onContinue: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = codes.join("\n");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  };
  return (
    <>
      <div className="text-center space-y-1">
        <ShieldCheck className="h-6 w-6 text-emerald-600 mx-auto" />
        <h2 className="text-lg font-semibold">Save your recovery codes</h2>
        <p className="text-xs text-muted-foreground">
          Store these codes in a safe place — a password manager is ideal. Each
          code can be used once if you lose access to your authenticator app. They
          will <strong>not</strong> be shown again.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 bg-muted p-3 rounded font-mono text-sm" data-testid="recovery-codes">
        {codes.map((c) => (
          <div key={c}>{c}</div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={copy}>
          {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
          {copied ? "Copied!" : "Copy all"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => downloadRecoveryCodesTxt(codes)}
          data-testid="button-download-recovery"
        >
          <Download className="h-4 w-4 mr-2" /> Download .txt
        </Button>
      </div>
      <Button type="button" className="w-full" size="lg" onClick={onContinue}>
        I've saved my codes — continue
      </Button>
    </>
  );
}
