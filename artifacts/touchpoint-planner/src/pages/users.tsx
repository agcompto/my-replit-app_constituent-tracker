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
import { Loader2, Plus, Edit2, KeyRound, AlertTriangle } from "lucide-react";
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

const createSchema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().min(1, "Name is required"),
  role: z.enum(["standard", "admin", "super_admin"]),
  password: z.string().min(8, "Must be at least 8 characters"),
});

const editSchema = z.object({
  name: z.string().min(1, "Name is required"),
  role: z.enum(["standard", "admin", "super_admin"]),
  active: z.boolean(),
});

const resetSchema = z.object({
  password: z.string().min(8, "Must be at least 8 characters"),
});

export default function Users() {
  const { data: users, isLoading } = useListUsers();
  const { data: me } = useGetMe();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [resetting, setResetting] = useState<UserRow | null>(null);

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
                  // Admins (non-super) can't manage super_admin accounts (server enforces this too)
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
                          title={disabledReason ?? "Reset password"}
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
      />
      <EditUserDialog
        user={editing}
        onClose={() => setEditing(null)}
        isSuperAdmin={isSuperAdmin}
      />
      <ResetPasswordDialog
        user={resetting}
        onClose={() => setResetting(null)}
      />
    </div>
  );
}

function CreateUserDialog({
  open,
  onOpenChange,
  isSuperAdmin,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  isSuperAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const mutation = useCreateUser();
  const form = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: { email: "", name: "", role: "standard", password: "" },
  });

  const onSubmit = (data: z.infer<typeof createSchema>) => {
    mutation.mutate(
      { data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          toast({
            title: "User created",
            description: `${data.email} will be required to change their password on first login.`,
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
            Create a new user account. They'll be required to change the temporary
            password on first sign-in.
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
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <Label>Temporary password</Label>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder="Min. 8 characters"
                      autoComplete="off"
                      {...field}
                    />
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
              <Button type="submit" disabled={mutation.isPending}>
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
}: {
  user: UserRow | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const mutation = useResetUserPassword();
  const form = useForm<z.infer<typeof resetSchema>>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: "" },
  });

  if (!user) return null;

  const onSubmit = (data: z.infer<typeof resetSchema>) => {
    mutation.mutate(
      { id: user.id, data },
      {
        onSuccess: () => {
          toast({
            title: "Password reset",
            description: `${user.email} will be required to set a new password on next sign-in.`,
          });
          form.reset();
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
          form.reset();
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset Password</DialogTitle>
          <DialogDescription>
            Set a temporary password for <strong>{user.email}</strong>. They'll be
            required to change it on next sign-in.
          </DialogDescription>
        </DialogHeader>
        {mutation.error && (
          <ErrorBanner
            error={mutation.error}
            fallback="Failed to reset password."
          />
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <Label>Temporary password</Label>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder="Min. 8 characters"
                      autoComplete="off"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
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
                  "Reset Password"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
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
