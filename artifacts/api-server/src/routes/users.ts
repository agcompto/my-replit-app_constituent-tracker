import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  CreateUserBody,
  UpdateUserParams,
  UpdateUserBody,
  ResetUserPasswordParams,
  ResetUserPasswordBody,
} from "@workspace/api-zod";
import { requireRole, audit } from "../lib/auth";

const router: IRouter = Router();

router.get("/users", requireRole("admin", "super_admin"), async (_req, res): Promise<void> => {
  const rows = await db.select().from(usersTable).orderBy(usersTable.createdAt);
  res.json(
    rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      role: r.role,
      active: r.active,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

router.post("/users", requireRole("admin", "super_admin"), async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email, name, role, password } = parsed.data;
  if (role === "super_admin" && req.currentUser!.role !== "super_admin") {
    res.status(403).json({ error: "Only super admins can create super admins" });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const [u] = await db
      .insert(usersTable)
      .values({
        email: email.toLowerCase().trim(),
        name,
        role,
        passwordHash,
        mustChangePassword: true,
      })
      .returning();
    await audit({
      actor: req.currentUser!,
      action: "create_user",
      entityType: "user",
      entityId: u.id,
      details: `Created ${u.email} as ${u.role}`,
    });
    res.status(201).json({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      active: u.active,
      createdAt: u.createdAt.toISOString(),
    });
  } catch {
    res.status(409).json({ error: "Email already exists" });
  }
});

router.patch("/users/:id", requireRole("admin", "super_admin"), async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateUserBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (body.data.role === "super_admin" && req.currentUser!.role !== "super_admin") {
    res.status(403).json({ error: "Only super admins can grant super_admin" });
    return;
  }
  const [u] = await db
    .update(usersTable)
    .set(body.data)
    .where(eq(usersTable.id, params.data.id))
    .returning();
  if (!u) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  await audit({
    actor: req.currentUser!,
    action: "update_user",
    entityType: "user",
    entityId: u.id,
    details: JSON.stringify(body.data),
  });
  res.json({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    active: u.active,
    createdAt: u.createdAt.toISOString(),
  });
});

router.post(
  "/users/:id/reset-password",
  requireRole("admin", "super_admin"),
  async (req, res): Promise<void> => {
    const params = ResetUserPasswordParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = ResetUserPasswordBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const passwordHash = await bcrypt.hash(body.data.password, 10);
    const [u] = await db
      .update(usersTable)
      .set({ passwordHash, mustChangePassword: true })
      .where(eq(usersTable.id, params.data.id))
      .returning();
    if (!u) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    await audit({
      actor: req.currentUser!,
      action: "reset_password",
      entityType: "user",
      entityId: u.id,
    });
    res.status(204).end();
  },
);

export default router;
