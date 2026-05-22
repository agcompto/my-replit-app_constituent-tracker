import { eq } from "drizzle-orm";
import { db, appSettingsTable } from "@workspace/db";

/** Whether Google Sheet audience import is enabled for this deployment. */
export async function googleSheetImportAllowed(): Promise<boolean> {
  const [s] = await db
    .select({ googleSheetImportEnabled: appSettingsTable.googleSheetImportEnabled })
    .from(appSettingsTable)
    .where(eq(appSettingsTable.id, 1))
    .limit(1);
  return !!s?.googleSheetImportEnabled;
}
