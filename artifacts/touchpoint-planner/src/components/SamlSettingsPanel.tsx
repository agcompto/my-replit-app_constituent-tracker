import {
  useGetSettings,
  useUpdateSamlSettings,
  useRefreshSamlMetadata,
  getGetSettingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { Loader2, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex gap-2">
        <Input readOnly value={value} className="font-mono text-xs" />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

export function SamlSettingsPanel() {
  const { data: settings, isLoading } = useGetSettings();
  const updateSaml = useUpdateSamlSettings();
  const refreshMeta = useRefreshSamlMetadata();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [domains, setDomains] = useState("");
  const [superAdminGroups, setSuperAdminGroups] = useState("");
  const [adminGroups, setAdminGroups] = useState("");
  const [standardGroups, setStandardGroups] = useState("");

  if (isLoading || !settings) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const syncFormFromSettings = () => {
    setDomains((settings.samlJitEmailDomains ?? []).join(", "));
    const map = settings.samlRoleGroupMap ?? { super_admin: [], admin: [], standard: [] };
    setSuperAdminGroups((map.super_admin ?? []).join("\n"));
    setAdminGroups((map.admin ?? []).join("\n"));
    setStandardGroups((map.standard ?? []).join("\n"));
  };

  if (domains === "" && settings.samlJitEmailDomains?.length) syncFormFromSettings();

  const save = () => {
    const parseLines = (s: string) =>
      s
        .split(/[\n,]+/)
        .map((x) => x.trim())
        .filter(Boolean);
    updateSaml.mutate(
      {
        data: {
          samlEnabled: settings.samlEnabled,
          samlIdpMetadataUrl: settings.samlIdpMetadataUrl ?? null,
          samlJitEmailDomains: domains
            .split(/[,]+/)
            .map((d) => d.trim().toLowerCase())
            .filter(Boolean),
          samlRoleGroupMap: {
            super_admin: parseLines(superAdminGroups),
            admin: parseLines(adminGroups),
            standard: parseLines(standardGroups),
          },
          samlGroupSyncEnabled: settings.samlGroupSyncEnabled ?? false,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "SAML settings saved" });
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        },
        onError: (err: unknown) => {
          const msg =
            err && typeof err === "object" && "data" in err
              ? String((err as { data?: { error?: string } }).data?.error)
              : "Save failed";
          toast({ title: msg, variant: "destructive" });
        },
      },
    );
  };

  const health = settings.samlHealth;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Single Sign-On (Microsoft Entra)</CardTitle>
        <CardDescription>
          SAML 2.0 federation. Signing certificates must match pinned SHA-256 fingerprints in{" "}
          <code className="text-xs">SAML_IDP_CERT_FINGERPRINT_SHA256</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <Label htmlFor="saml-enabled">Enable SAML SSO</Label>
          <Switch
            id="saml-enabled"
            checked={settings.samlEnabled ?? false}
            onCheckedChange={(checked) =>
              updateSaml.mutate(
                { data: { samlEnabled: checked } },
                {
                  onSuccess: () =>
                    queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() }),
                },
              )
            }
          />
        </div>

        {settings.samlSpEntityId && (
          <div className="space-y-3 rounded-md border p-4 bg-muted/30">
            <CopyField label="SP Entity ID (Identifier in Entra)" value={settings.samlSpEntityId} />
            <CopyField label="ACS URL (Reply URL)" value={settings.samlAcsUrl ?? ""} />
            <CopyField label="Metadata URL" value={settings.samlMetadataUrl ?? ""} />
          </div>
        )}

        <div className="space-y-2">
          <Label>IdP Federation Metadata URL (HTTPS)</Label>
          <Input
            value={settings.samlIdpMetadataUrl ?? ""}
            onChange={(e) =>
              updateSaml.mutate(
                { data: { samlIdpMetadataUrl: e.target.value || null } },
                { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() }) },
              )
            }
            placeholder="https://login.microsoftonline.com/.../federationmetadata/2007-06/federationmetadata.xml"
          />
        </div>

        <div className="space-y-2">
          <Label>JIT email domains (comma-separated)</Label>
          <Input
            value={domains || (settings.samlJitEmailDomains ?? []).join(", ")}
            onChange={(e) => setDomains(e.target.value)}
            placeholder="ncsu.edu"
          />
        </div>

        <div className="flex items-center justify-between">
          <Label>Sync roles from Entra groups</Label>
          <Switch
            checked={settings.samlGroupSyncEnabled ?? false}
            onCheckedChange={(checked) =>
              updateSaml.mutate(
                { data: { samlGroupSyncEnabled: checked } },
                { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() }) },
              )
            }
          />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">super_admin group Object IDs</Label>
            <textarea
              className="w-full min-h-[80px] rounded-md border p-2 text-xs font-mono"
              value={superAdminGroups || (settings.samlRoleGroupMap?.super_admin ?? []).join("\n")}
              onChange={(e) => setSuperAdminGroups(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">admin group Object IDs</Label>
            <textarea
              className="w-full min-h-[80px] rounded-md border p-2 text-xs font-mono"
              value={adminGroups || (settings.samlRoleGroupMap?.admin ?? []).join("\n")}
              onChange={(e) => setAdminGroups(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">standard group Object IDs</Label>
            <textarea
              className="w-full min-h-[80px] rounded-md border p-2 text-xs font-mono"
              value={standardGroups || (settings.samlRoleGroupMap?.standard ?? []).join("\n")}
              onChange={(e) => setStandardGroups(e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-md border p-4 space-y-2 text-sm">
          <p className="font-medium">SAML health</p>
          <ul className="text-muted-foreground space-y-1">
            <li>Metadata loaded: {health?.metadataLoaded ? "yes" : "no"}</li>
            <li>Fingerprint matches pin: {health?.fingerprintMatches ? "yes" : "no"}</li>
            <li>Last refresh: {health?.lastMetadataRefreshAt ?? "—"}</li>
            <li>Cert expires: {health?.certExpiresAt ?? "—"}</li>
            {health?.failureReason && <li className="text-destructive">Issue: {health.failureReason}</li>}
          </ul>
          <Button
            variant="outline"
            size="sm"
            disabled={refreshMeta.isPending}
            onClick={() =>
              refreshMeta.mutate(undefined, {
                onSuccess: () => {
                  toast({ title: "Metadata refreshed" });
                  queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
                },
              })
            }
          >
            {refreshMeta.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh now"}
          </Button>
        </div>

        <Button onClick={save} disabled={updateSaml.isPending}>
          {updateSaml.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save SAML settings"}
        </Button>
      </CardContent>
    </Card>
  );
}
