import {
  useListUsers,
  useGetMe,
  useCreateUser,
  useUpdateUser,
  useResetUserPassword,
  useResendInvite,
  useDeleteUser,
  useResetUserTotp,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import { useEffect, useState } from "react";
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
  Send,
  Trash2,
  ShieldOff,
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { ReauthDialog, isReauthRequired } from "@/components/ReauthDialog";

type Role = "standard" | "admin" | "super_admin";
type UserRow = {
  id: number;
  email: string;
  name: string;
  role: string;
  active: boolean;
  createdAt: string;
};

interface InviteResult {
  email: string;
  name: string;
  setupUrl: string;
  expiresAt: string;
  kind: "invite" | "reset";
  emailed?: boolean;
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
  const [resending, setResending] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState<UserRow | null>(null);
  const [resettingTotp, setResettingTotp] = useState<UserRow | null>(null);
  const [invite, setInvite] = useState<InviteResult | null>(null);

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
            Manage system access and roles. Adding a user generates a one-time
            setup link you'll deliver to them through a secure channel.
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
                  const isSelf = me?.id === user.id;
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
                      <TableCell className="pr-6 text-right space-x-1">
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
                          title={disabledReason ?? "Resend setup link"}
                          disabled={!canManage}
                          onClick={() => setResending(user as UserRow)}
                          data-testid={`button-resend-invite-${user.id}`}
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title={disabledReason ?? "Send password-reset link"}
                          disabled={!canManage}
                          onClick={() => setResetting(user as UserRow)}
                          data-testid={`button-reset-password-${user.id}`}
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        {isSuperAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Reset two-factor authentication (forces re-enrollment)"
                            onClick={() => setResettingTotp(user as UserRow)}
                            data-testid={`button-reset-totp-${user.id}`}
                          >
                            <ShieldOff className="h-4 w-4" />
                          </Button>
                        )}
                        {isSuperAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title={
                              isSelf
                                ? "You cannot delete your own account."
                                : "Delete user permanently"
                            }
                            disabled={isSelf}
                            onClick={() => setDeleting(user as UserRow)}
                            data-testid={`button-delete-user-${user.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
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
        onCreated={(c) => setInvite(c)}
      />
      <EditUserDialog
        user={editing}
        onClose={() => setEditing(null)}
        isSuperAdmin={isSuperAdmin}
      />
      <ResetPasswordDialog
        user={resetting}
        onClose={() => setResetting(null)}
        onReset={(c) => setInvite(c)}
      />
      <ResendInviteDialog
        user={resending}
        onClose={() => setResending(null)}
        onResent={(c) => setInvite(c)}
      />
      <DeleteUserDialog user={deleting} onClose={() => setDeleting(null)} />
      <ResetTotpDialog user={resettingTotp} onClose={() => setResettingTotp(null)} />
      <InviteResultDialog
        invite={invite}
        onClose={() => setInvite(null)}
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
  onCreated: (c: InviteResult) => void;
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
            setupUrl: resp.setupUrl,
            expiresAt: resp.expiresAt,
            kind: "invite",
            emailed: resp.emailed,
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
            A one-time setup link will be generated. Hand it to the user
            through a secure channel — they'll choose their own password.
            Admins never see or type passwords for users.
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
                  "Create User & Generate Link"
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

  const [reauthOpen, setReauthOpen] = useState(false);
  const [pendingData, setPendingData] = useState<z.infer<typeof editSchema> | null>(null);
  // Granting super_admin requires recent password auth. If the server says
  // so, queue the form values, prompt for the password, then re-submit.
  useEffect(() => {
    if (isReauthRequired(mutation.error)) setReauthOpen(true);
  }, [mutation.error]);

  if (!user) return null;

  const submit = (data: z.infer<typeof editSchema>) => {
    mutation.mutate(
      { id: user.id, data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          toast({ title: "User updated" });
          setPendingData(null);
          onClose();
        },
      },
    );
  };

  const onSubmit = (data: z.infer<typeof editSchema>) => {
    setPendingData(data);
    submit(data);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        {mutation.error && !isReauthRequired(mutation.error) && (
          <ErrorBanner error={mutation.error} fallback="Failed to update user." />
        )}
        <ReauthDialog
          open={reauthOpen}
          onClose={() => setReauthOpen(false)}
          onSuccess={() => {
            setReauthOpen(false);
            mutation.reset();
            if (pendingData) submit(pendingData);
          }}
          description="Granting super-admin requires confirming your password."
        />
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
  onReset: (c: InviteResult) => void;
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
            setupUrl: resp.setupUrl,
            expiresAt: resp.expiresAt,
            kind: "reset",
            emailed: resp.emailed,
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
          <DialogTitle>Generate password-reset link?</DialogTitle>
          <DialogDescription>
            A one-time link will be generated for <strong>{user.email}</strong>.
            Hand it to them through a secure channel. They'll choose a new
            password through that link. Their existing password will keep
            working until the new one is set.
          </DialogDescription>
        </DialogHeader>
        {mutation.error && (
          <ErrorBanner
            error={mutation.error}
            fallback="Failed to send reset link."
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
              "Generate Reset Link"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResendInviteDialog({
  user,
  onClose,
  onResent,
}: {
  user: UserRow | null;
  onClose: () => void;
  onResent: (c: InviteResult) => void;
}) {
  const mutation = useResendInvite();
  if (!user) return null;
  const onConfirm = () => {
    mutation.mutate(
      { id: user.id },
      {
        onSuccess: (resp) => {
          onResent({
            email: user.email,
            name: user.name,
            setupUrl: resp.setupUrl,
            expiresAt: resp.expiresAt,
            kind: "invite",
            emailed: resp.emailed,
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
          <DialogTitle>Generate new setup link?</DialogTitle>
          <DialogDescription>
            A new one-time setup link will be generated for{" "}
            <strong>{user.email}</strong>. Any previous unused setup link will
            stop working. Hand the new link to them through a secure channel.
          </DialogDescription>
        </DialogHeader>
        {mutation.error && (
          <ErrorBanner error={mutation.error} fallback="Failed to resend invite." />
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
            data-testid="button-confirm-resend-invite"
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Generate New Link"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteUserDialog({
  user,
  onClose,
}: {
  user: UserRow | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const mutation = useDeleteUser();
  const [confirm, setConfirm] = useState("");
  const [reauthOpen, setReauthOpen] = useState(false);
  // The server gates DELETE /users/:id on `requireRecentAuth`. If the
  // session's last password-auth is stale, the API returns 403 with
  // `code: "reauth_required"`. Pop the ReauthDialog and retry the delete
  // once the user re-enters their password.
  useEffect(() => {
    if (isReauthRequired(mutation.error)) setReauthOpen(true);
  }, [mutation.error]);
  if (!user) return null;
  const onConfirm = () => {
    mutation.mutate(
      { id: user.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          toast({
            title: "User deleted",
            description: `${user.email} has been permanently removed.`,
          });
          setConfirm("");
          onClose();
        },
      },
    );
  };
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) {
          setConfirm("");
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete user permanently?</DialogTitle>
          <DialogDescription>
            This permanently removes <strong>{user.email}</strong> and revokes
            all access. Their historical actions remain in the audit log
            (without the actor link). Campaigns they own will be reassigned to
            you. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {mutation.error && !isReauthRequired(mutation.error) && (
          <ErrorBanner error={mutation.error} fallback="Failed to delete user." />
        )}
        <ReauthDialog
          open={reauthOpen}
          onClose={() => setReauthOpen(false)}
          onSuccess={() => {
            setReauthOpen(false);
            mutation.reset();
            onConfirm();
          }}
          description="Deleting a user is permanent. Re-enter your password to confirm."
        />
        <div className="space-y-2">
          <Label>
            Type <code className="font-mono">{user.email}</code> to confirm
          </Label>
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            data-testid="input-delete-confirm"
            placeholder={user.email}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setConfirm("");
              onClose();
            }}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={mutation.isPending || confirm !== user.email}
            onClick={onConfirm}
            data-testid="button-confirm-delete-user"
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Delete Permanently"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InviteResultDialog({
  invite,
  onClose,
}: {
  invite: InviteResult | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  if (!invite) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite.setupUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast({ title: "Setup link copied to clipboard" });
    } catch {
      toast({
        title: "Could not copy",
        description: "Select the link manually and copy it.",
        variant: "destructive",
      });
    }
  };

  const title =
    invite.kind === "invite" ? "Account created" : "Reset link generated";

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
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {invite.emailed ? (
              <>
                The one-time link was emailed to{" "}
                <strong>{invite.email}</strong>. You can also copy the link
                below and deliver it through another secure channel as a
                backup.
              </>
            ) : (
              <>
                Copy the one-time link below and share it with{" "}
                <strong>{invite.email}</strong> through a secure channel (e.g.
                in person or via an authenticated workplace messenger).
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {invite.emailed && (
          <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            <Send className="h-4 w-4" />
            <span>Email sent to {invite.email}</span>
          </div>
        )}

        <div className="space-y-3">
          <div className="rounded-md border bg-muted/40 p-3 space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              One-time setup link
            </div>
            <div className="flex items-center gap-2">
              <code
                className="flex-1 font-mono text-xs bg-background border rounded px-3 py-2 break-all select-all"
                data-testid="text-setup-url"
              >
                {invite.setupUrl}
              </code>
              <Button
                size="icon"
                variant="outline"
                onClick={copy}
                title="Copy setup link"
                data-testid="button-copy-setup-url"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Single use. Expires{" "}
              {format(new Date(invite.expiresAt), "MMM d, yyyy 'at' h:mm a")}.
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

function ResetTotpDialog({
  user,
  onClose,
}: {
  user: UserRow | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const mutation = useResetUserTotp();
  const [reauthOpen, setReauthOpen] = useState(false);
  useEffect(() => {
    if (isReauthRequired(mutation.error)) setReauthOpen(true);
  }, [mutation.error]);
  if (!user) return null;
  const submit = () => {
    mutation.mutate(
      { id: user.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          toast({
            title: "Two-factor reset",
            description: `${user.email} will be prompted to re-enroll on their next sign-in.`,
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
          <DialogTitle>Reset two-factor authentication?</DialogTitle>
          <DialogDescription>
            This clears the TOTP enrollment and recovery codes for{" "}
            <strong>{user.email}</strong>. If their role still requires
            two-factor (admin or super admin), they will be guided through
            enrollment on their next sign-in. Otherwise their account will
            sign in with password only until they choose to re-enroll.
          </DialogDescription>
        </DialogHeader>
        {mutation.error && !isReauthRequired(mutation.error) && (
          <ErrorBanner
            error={mutation.error}
            fallback="Failed to reset two-factor."
          />
        )}
        <ReauthDialog
          open={reauthOpen}
          onClose={() => setReauthOpen(false)}
          onSuccess={() => {
            setReauthOpen(false);
            mutation.reset();
            submit();
          }}
          description="Resetting another user's two-factor requires confirming your password."
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={mutation.isPending}
            data-testid="button-confirm-reset-totp"
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reset two-factor"}
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
