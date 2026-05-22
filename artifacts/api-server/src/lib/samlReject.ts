import { db, auditLogTable } from "@workspace/db";

export type SamlRejectReason =
  | "domain_not_allowed"
  | "signature_invalid"
  | "assertion_expired"
  | "replay_detected"
  | "audience_invalid"
  | "recipient_invalid"
  | "inresponseto_invalid"
  | "metadata_invalid"
  | "replay_unavailable"
  | "unknown";

export async function auditSamlRejected(
  reason: SamlRejectReason,
  details?: string | null,
): Promise<void> {
  await db.insert(auditLogTable).values({
    actorUserId: null,
    actorName: "System",
    actorRole: "system",
    action: "saml_login_rejected",
    entityType: "auth",
    entityId: null,
    details: JSON.stringify({ reason, detail: details ?? null }),
  });
}
