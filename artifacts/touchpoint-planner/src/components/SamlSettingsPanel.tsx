import {
  useGetSettings,
  useUpdateSamlSettings,
  useRefreshSamlMetadata,
  getGetSettingsQueryKey,
} from "@workspace/api-client-react";
import { apiErrorMessage } from "@/lib/apiError";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useEffect, useState } from "react";
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

function parseGroupLines(s: string): string[] {
  return s
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function SamlSettingsPanel() {
  const { data: settings, isLoading, isError, error, refetch } = useGetSettings();
  const updateSaml = useUpdateSamlSettings();
  const refreshMeta = useRefreshSamlMetadata();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [metadataUrl, setMetadataUrl] = useState("");
  const [domains, setDomains] = useState("");
  const [superAdminGroups, setSuperAdminGroups] = useState("");
  const [adminGroups, setAdminGroups] = useState("");
  const [standardGroups, setStandardGroups] = useState("");

  useEffect(() => {
    if (!settings) return;
    setMetadataUrl(settings.samlIdpMetadataUrl ?? "");
    setDomains((settings.samlJitEmailDomains ?? []).join(", "));
    const map = settings.samlRoleGroupMap ?? { super_admin: [], admin: [], standard: [] };
    setSuperAdminGroups((map.super_admin ?? []).join("\n"));
    setAdminGroups((map.admin ?? []).join("\n"));
    setStandardGroups((map.standard ?? []).join("\n"));
  }, [settings]);

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (isError || !settings) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-3">
          <p className="text-sm text-destructive">
            Failed to load SSO settings: {apiErrorMessage(error, "Could not load settings.")}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const invalidateSettings = () =>
    queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });

  const save = () => {
    updateSaml.mutate(
      {
        data: {
          samlEnabled: settings.samlEnabled,
          samlIdpMetadataUrl: metadataUrl.trim() || null,
          samlJitEmailDomains: domains
            .split(/[,]+/)
            .map((d) => d.trim().toLowerCase())
            .filter(Boolean),
          samlRoleGroupMap: {
            super_admin: parseGroupLines(superAdminGroups),
            admin: parseGroupLines(adminGroups),
            standard: parseGroupLines(standardGroups),
          },
          samlGroupSyncEnabled: settings.samlGroupSyncEnabled ?? false,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "SAML settings saved" });
          invalidateSettings();
        },
        onError: (err: unknown) => {
          toast({
            title: apiErrorMessage(err, "Save failed"),
            variant: "destructive",
          });
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
                { onSuccess: invalidateSettings },
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
            value={metadataUrl}
            onChange={(e) => setMetadataUrl(e.target.value)}
            placeholder="https://login.microsoftonline.com/.../federationmetadata/2007-06/federationmetadata.xml"
          />
        </div>

        <div className="space-y-2">
          <Label>JIT email domains (comma-separated)</Label>
          <Input
            value={domains}
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
                { onSuccess: invalidateSettings },
              )
            }
          />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">super_admin group Object IDs</Label>
            <textarea
              className="w-full min-h-[80px] rounded-md border p-2 text-xs font-mono"
              value={superAdminGroups}
              onChange={(e) => setSuperAdminGroups(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">admin group Object IDs</Label>
            <textarea
              className="w-full min-h-[80px] rounded-md border p-2 text-xs font-mono"
              value={adminGroups}
              onChange={(e) => setAdminGroups(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">standard group Object IDs</Label>
            <textarea
              className="w-full min-h-[80px] rounded-md border p-2 text-xs font-mono"
              value={standardGroups}
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
            {health?.failureReason && (
              <li className="text-destructive">Issue: {health.failureReason}</li>
            )}
          </ul>
          <Button
            variant="outline"
            size="sm"
            disabled={refreshMeta.isPending}
            onClick={() =>
              refreshMeta.mutate(undefined, {
                onSuccess: () => {
                  toast({ title: "Metadata refreshed" });
                  invalidateSettings();
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
