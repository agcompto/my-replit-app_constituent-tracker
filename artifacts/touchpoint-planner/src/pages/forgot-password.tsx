import { useState } from "react";
import { Link } from "wouter";
import { useForgotPassword } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { CheckCircle2, Loader2, Mail } from "lucide-react";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
});

export default function ForgotPassword() {
  const [submitted, setSubmitted] = useState(false);
  const mutation = useForgotPassword();
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });
  const onSubmit = (data: z.infer<typeof schema>) => {
    mutation.mutate({ data }, { onSettled: () => setSubmitted(true) });
  };
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg border p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="h-12 w-12 bg-primary mx-auto rounded flex items-center justify-center mb-4">
            <span className="text-primary-foreground font-bold text-xl leading-none tracking-tighter">NC</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Reset your password</h1>
          <p className="text-sm text-muted-foreground">
            Enter your email and we'll send you a one-time link to choose a new password.
          </p>
        </div>

        {submitted ? (
          <div className="rounded-md bg-emerald-50 text-emerald-800 p-4 text-sm space-y-2">
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="h-5 w-5" /> Check your email
            </div>
            <p>
              If an account exists for that email, a reset link is on its way.
              The link expires in 2 hours and can only be used once.
            </p>
            <p className="text-xs text-emerald-700">
              Didn't get an email? Check your spam folder, or contact your
              administrator if you don't have access to the inbox anymore.
            </p>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <Label>Email</Label>
                    <FormControl>
                      <Input type="email" autoComplete="email" placeholder="you@ncsu.edu" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" size="lg" disabled={mutation.isPending} data-testid="button-submit-forgot">
                {mutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : (<><Mail className="h-4 w-4 mr-2" /> Send reset link</>)}
              </Button>
            </form>
          </Form>
        )}

        <div className="text-center text-sm">
          <Link href="/login" className="text-primary hover:underline">Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
