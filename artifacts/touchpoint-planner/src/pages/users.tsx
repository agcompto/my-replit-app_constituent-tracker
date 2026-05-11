import {
  useListUsers,
  useGetMe,
  useCreateUser,
  useUpdateUser,
  useResetUserPassword,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import {
  Loader2,
  Plus,
  Edit2,
  KeyRound,
  AlertTriangle,
  Copy,
  Check,
  Mail,
  MailX,
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

type Role = "standard" | "admin" | "super_admin";
type UserRow = {
  id: number;
  email: string;
  name: string;
  role: string;
  active: boolean;
  createdAt: string;
};

interface GeneratedCredentials {
  email: string;
  name: string;
  tempPassword: string;
  emailSent: boolean;
  emailError?: string | null;
  kind: "new_account" | "reset";
}

const createSchema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().min(1, "Name is required"),
  role: z.enum(["standard", "admin", "super_admin"]),
});

const editSchema = z.object({
  name: z.string().min(1, "Name is required"),
  role: z.enum(["standard", "admin", "super_admin"]),
  active: z.boolean(),
});

export default function Users() {
  const { data: users, isLoading } = useListUsers();
  const { data: me } = useGetMe();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [resetting, setResetting] = useState<UserRow | null>(null);
  const [credentials, setCredentials] = useState<GeneratedCredentials | null>(null);

  const isAdmin = me?.role === "admin" || me?.role === "super_admin";
  const isSuperAdmin = me?.role === "super_admin";

  if (!isAdmin) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold">Access Denied</h2>
          <p className="text-muted-foreground">
            You do not have permission to view this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Users</h1>
          <p className="text-muted-foreground text-sm">
            Manage system access and roles.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} data-testid="button-add-user">
          <Plus className="h-4 w-4 mr-2" /> Add User
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="pr-6 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                  </TableCell>
                </TableRow>
              ) : (
                users?.map((user) => {
                  const targetIsSuper = user.role === "super_admin";
                  const canManage = isSuperAdmin || !targetIsSuper;
                  const disabledReason = canManage
                    ? undefined
                    : "Only a super admin can manage another super admin.";
                  return (
                    <TableRow key={user.id}>
                      <TableCell className="pl-6 font-medium">{user.name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="uppercase text-[10px]">
                          {user.role.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {user.active ? (
                          <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {format(new Date(user.createdAt), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="pr-6 text-right space-x-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          title={disabledReason ?? "Edit user"}
                          disabled={!canManage}
                          onClick={() => setEditing(user as UserRow)}
                          data-testid={`button-edit-user-${user.id}`}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title={disabledReason ?? "Generate new temporary password"}
                          disabled={!canManage}
                          onClick={() => setResetting(user as UserRow)}
                          data-testid={`button-reset-password-${user.id}`}
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        isSuperAdmin={isSuperAdmin}
        onCreated={(c) => setCredentials(c)}
      />
      <EditUserDialog
        user={editing}
        onClose={() => setEditing(null)}
        isSuperAdmin={isSuperAdmin}
      />
      <ResetPasswordDialog
        user={resetting}
        onClose={() => setResetting(null)}
        onReset={(c) => setCredentials(c)}
      />
      <CredentialsDialog
        credentials={credentials}
        onClose={() => setCredentials(null)}
      />
    </div>
  );
}

function CreateUserDialog({
  open,
  onOpenChange,
  isSuperAdmin,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  isSuperAdmin: boolean;
  onCreated: (c: GeneratedCredentials) => void;
}) {
  const queryClient = useQueryClient();
  const mutation = useCreateUser();
  const form = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: { email: "", name: "", role: "standard" },
  });

  const onSubmit = (data: z.infer<typeof createSchema>) => {
    mutation.mutate(
      { data },
      {
        onSuccess: (resp) => {
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          onCreated({
            email: resp.user.email,
            name: resp.user.name,
            tempPassword: resp.tempPassword,
            emailSent: resp.emailSent,
            emailError: resp.emailError,
            kind: "new_account",
          });
          form.reset();
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) form.reset();
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add User</DialogTitle>
          <DialogDescription>
            A secure temporary password will be generated automatically and emailed
            to the user. They'll be required to change it on first sign-in.
          </DialogDescription>
        </DialogHeader>
        {mutation.error && (
          <ErrorBanner error={mutation.error} fallback="Failed to create user." />
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
                    <Input type="email" placeholder="user@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <Label>Name</Label>
                  <FormControl>
                    <Input placeholder="Full name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <Label>Role</Label>
                  <FormControl>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard">Standard</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        {isSuperAdmin && (
                          <SelectItem value="super_admin">Super Admin</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={mutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={mutation.isPending}
                data-testid="button-submit-create-user"
              >
                {mutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Create User"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({
  user,
  onClose,
  isSuperAdmin,
}: {
  user: UserRow | null;
  onClose: () => void;
  isSuperAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const mutation = useUpdateUser();
  const form = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    values: user
      ? { name: user.name, role: user.role as Role, active: user.active }
      : undefined,
  });

  if (!user) return null;

  const onSubmit = (data: z.infer<typeof editSchema>) => {
    mutation.mutate(
      { id: user.id, data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          toast({ title: "User updated" });
          onClose();
        },
      },
    );
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        {mutation.error && (
          <ErrorBanner error={mutation.error} fallback="Failed to update user." />
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <Label>Name</Label>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <Label>Role</Label>
                  <FormControl>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard">Standard</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        {isSuperAdmin && (
                          <SelectItem value="super_admin">Super Admin</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <Label>Active</Label>
                    <p className="text-xs text-muted-foreground">
                      Inactive users cannot sign in.
                    </p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={mutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Save Changes"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({
  user,
  onClose,
  onReset,
}: {
  user: UserRow | null;
  onClose: () => void;
  onReset: (c: GeneratedCredentials) => void;
}) {
  const mutation = useResetUserPassword();

  if (!user) return null;

  const onConfirm = () => {
    mutation.mutate(
      { id: user.id, data: {} },
      {
        onSuccess: (resp) => {
          onReset({
            email: user.email,
            name: user.name,
            tempPassword: resp.tempPassword,
            emailSent: resp.emailSent,
            emailError: resp.emailError,
            kind: "reset",
          });
          onClose();
        },
      },
    );
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate new temporary password?</DialogTitle>
          <DialogDescription>
            A new temporary password will be generated for{" "}
            <strong>{user.email}</strong> and emailed to them. The current
            password will stop working immediately, and they'll be required to
            choose a new one on next sign-in.
          </DialogDescription>
        </DialogHeader>
        {mutation.error && (
          <ErrorBanner
            error={mutation.error}
            fallback="Failed to reset password."
          />
        )}
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
            onClick={onConfirm}
            disabled={mutation.isPending}
            data-testid="button-confirm-reset-password"
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Generate & Email"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CredentialsDialog({
  credentials,
  onClose,
}: {
  credentials: GeneratedCredentials | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  if (!credentials) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(credentials.tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast({ title: "Password copied to clipboard" });
    } catch {
      toast({
        title: "Could not copy",
        description: "Select the password manually and copy it.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) {
          setCopied(false);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {credentials.kind === "new_account"
              ? "Account created"
              : "Password reset"}
          </DialogTitle>
          <DialogDescription>
            {credentials.emailSent ? (
              <span className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                <Mail className="h-4 w-4" /> Sent the temporary password to{" "}
                <strong>{credentials.email}</strong>.
              </span>
            ) : (
              <span className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <MailX className="h-4 w-4" /> Email was not sent
                {credentials.emailError ? ` (${credentials.emailError})` : ""}.
                Share this password with the user securely.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border bg-muted/40 p-3 space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Temporary password
            </div>
            <div className="flex items-center gap-2">
              <code
                className="flex-1 font-mono text-sm bg-background border rounded px-3 py-2 break-all select-all"
                data-testid="text-temp-password"
              >
                {credentials.tempPassword}
              </code>
              <Button
                size="icon"
                variant="outline"
                onClick={copy}
                title="Copy password"
                data-testid="button-copy-temp-password"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              This is the only time the password will be shown.{" "}
              {credentials.emailSent
                ? "The user has also received it by email."
                : "Email delivery is unavailable, so make sure to capture it now."}{" "}
              The user will be required to set a new password on first sign-in.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose} data-testid="button-close-credentials">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ErrorBanner({
  error,
  fallback,
}: {
  error: unknown;
  fallback: string;
}) {
  const err = error as any;
  const message =
    err?.data?.error ?? err?.response?.data?.error ?? err?.message ?? fallback;
  return (
    <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm flex items-center gap-2">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
