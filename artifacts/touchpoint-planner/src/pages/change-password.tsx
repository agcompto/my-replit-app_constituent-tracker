import { useChangeOwnPassword, getGetMeQueryKey, useGetMe } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { PasswordStrengthMeter, evaluatePasswordStrength } from "@/components/password-strength";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(12, "Must be at least 12 characters"),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: "New password must be different from current password",
    path: ["newPassword"],
  });

export default function ChangePassword() {
  const [, setLocation] = useLocation();
  const { data: user } = useGetMe();
  const mutation = useChangeOwnPassword();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const onSubmit = (data: z.infer<typeof schema>) => {
    mutation.mutate(
      { data: { currentPassword: data.currentPassword, newPassword: data.newPassword } },
      {
        onSuccess: (updated) => {
          // Set cached /auth/me synchronously so AuthGuard doesn't bounce us back
          // before the refetch lands.
          queryClient.setQueryData(getGetMeQueryKey(), updated);
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          toast({ title: "Password updated", description: "Your password has been changed." });
          setLocation("/");
        },
      },
    );
  };

  const isForced = user?.mustChangePassword;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg border p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="h-12 w-12 bg-primary mx-auto rounded flex items-center justify-center mb-4">
            <span className="text-primary-foreground font-bold text-xl leading-none tracking-tighter">NC</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isForced ? "Set a New Password" : "Change Password"}
          </h1>
          {isForced && (
            <p className="text-sm text-muted-foreground">
              For your security, please change your password before continuing.
            </p>
          )}
        </div>

        {mutation.error && (
          <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              {(mutation.error as any)?.data?.error ||
                "Failed to change password. Please try again."}
            </span>
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <Label>Current password</Label>
                  <FormControl>
                    <Input type="password" autoComplete="current-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <Label>New password</Label>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                  <PasswordStrengthMeter
                    password={field.value}
                    email={user?.email}
                    name={user?.name}
                  />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <Label>Confirm new password</Label>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={
                mutation.isPending ||
                !evaluatePasswordStrength({
                  password: form.watch("newPassword"),
                  email: user?.email,
                  name: user?.name,
                }).meetsPolicy
              }
            >
              {mutation.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                "Update Password"
              )}
            </Button>
            {!isForced && (
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setLocation("/")}
                disabled={mutation.isPending}
              >
                Cancel
              </Button>
            )}
          </form>
        </Form>
      </div>
    </div>
  );
}
