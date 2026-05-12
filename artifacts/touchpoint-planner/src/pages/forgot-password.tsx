import { useForgotPassword } from "@workspace/api-client-react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

interface ApiErrorShape {
  status?: number;
  data?: { error?: string };
  response?: { status?: number; data?: { error?: string } };
  message?: string;
}

function readApiError(err: unknown): { status?: number; message?: string } {
  if (!err || typeof err !== "object") return {};
  const e = err as ApiErrorShape;
  return {
    status: e.status ?? e.response?.status,
    message: e.data?.error ?? e.response?.data?.error ?? e.message,
  };
}

const schema = z.object({
  email: z.string().email("Invalid email address"),
});

export default function ForgotPassword() {
  const mutation = useForgotPassword();
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  const onSubmit = (data: z.infer<typeof schema>) => {
    mutation.mutate({ data });
  };

  const submitted = mutation.isSuccess;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg border p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="h-12 w-12 bg-primary mx-auto rounded flex items-center justify-center mb-4">
            <span className="text-primary-foreground font-bold text-xl leading-none tracking-tighter">
              NC
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            Reset your password
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter the email address tied to your Constituent Touchpoint
            Planner account. If it matches an active user, we'll send a
            one-time setup link.
          </p>
        </div>

        {submitted ? (
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-md text-sm flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                If that email is associated with an active account, a reset
                link has been sent. Check your inbox (and spam folder). The
                link expires in 2 hours.
              </span>
            </div>
            <Link
              href="/login"
              className="block text-center text-sm text-primary hover:underline"
              data-testid="link-back-to-login"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            {mutation.error && (() => {
              const { status, message: serverMsg } = readApiError(
                mutation.error,
              );
              const message =
                status === 429
                  ? serverMsg ??
                    "Too many requests. Please try again in a few minutes."
                  : serverMsg ?? "Something went wrong. Please try again.";
              return (
                <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{message}</span>
                </div>
              );
            })()}

            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <Label>Email</Label>
                      <FormControl>
                        <Input
                          placeholder="you@ncsu.edu"
                          type="email"
                          autoComplete="email"
                          data-testid="input-forgot-email"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={mutation.isPending}
                  data-testid="button-send-reset-link"
                >
                  {mutation.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    "Send reset link"
                  )}
                </Button>
                <Link
                  href="/login"
                  className="block text-center text-sm text-muted-foreground hover:text-primary hover:underline"
                  data-testid="link-back-to-login"
                >
                  Back to sign in
                </Link>
              </form>
            </Form>
          </>
        )}
      </div>
    </div>
  );
}
