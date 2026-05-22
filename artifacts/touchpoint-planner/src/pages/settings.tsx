import { useGetSettings, useUpdateSettings, useListCampaignTypes, useCreateCampaignType, useUpdateCampaignType, useListChannels, useCreateChannel, useUpdateChannel, useListOwningUnits, useCreateOwningUnit, useUpdateOwningUnit, useRunRetentionDelete, useListSuppressionReasons, useCreateSuppressionReason, useUpdateSuppressionReason, useListThresholdTemplates, useCreateThresholdTemplate, useUpdateThresholdTemplate, useDeleteThresholdTemplate, useGetRetentionSchedule, useUpdateRetentionSchedule, useRunScheduledRetentionNow, getListCampaignTypesQueryKey, getListChannelsQueryKey, getListOwningUnitsQueryKey, getGetSettingsQueryKey, getListSuppressionReasonsQueryKey, getListThresholdTemplatesQueryKey, getGetRetentionScheduleQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Plus, AlertTriangle, Trash2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil } from "lucide-react";
import { SecuritySettings } from "@/components/SecuritySettings";
import { SamlSettingsPanel } from "@/components/SamlSettingsPanel";

export default function Settings() {
  const { data: me } = useGetMe();
  const isAdmin = me?.role === "admin" || me?.role === "super_admin";
  const isSuperAdmin = me?.role === "super_admin";

  const { data: settings, isLoading: settingsLoading } = useGetSettings();
  const updateSettings = useUpdateSettings();
  
  const { data: campaignTypes, isLoading: typesLoading } = useListCampaignTypes();
  const createCampaignType = useCreateCampaignType();
  const updateCampaignType = useUpdateCampaignType();

  const { data: channels, isLoading: channelsLoading } = useListChannels();
  const createChannel = useCreateChannel();
  const updateChannel = useUpdateChannel();

  const { data: owningUnits, isLoading: unitsLoading } = useListOwningUnits();
  const createOwningUnit = useCreateOwningUnit();
  const updateOwningUnit = useUpdateOwningUnit();

  const runRetention = useRunRetentionDelete();

  const { data: reasonCodes, isLoading: reasonsLoading } = useListSuppressionReasons();
  const createReason = useCreateSuppressionReason();
  const updateReason = useUpdateSuppressionReason();

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [newTypeName, setNewTypeName] = useState("");
  const [newChannelName, setNewChannelName] = useState("");
  const [newUnitName, setNewUnitName] = useState("");

  const [retentionDate, setRetentionDate] = useState("");
  const [retentionConfirmOpen, setRetentionConfirmOpen] = useState(false);

  const [newReasonName, setNewReasonName] = useState("");
  const [newReasonDescription, setNewReasonDescription] = useState("");

  const handleAddReason = () => {
    if (!newReasonName.trim()) return;
    createReason.mutate(
      { data: { name: newReasonName.trim(), description: newReasonDescription || undefined } },
      {
        onSuccess: () => {
          setNewReasonName("");
          setNewReasonDescription("");
          toast({ title: "Reason code added" });
          queryClient.invalidateQueries({ queryKey: getListSuppressionReasonsQueryKey() });
        },
        onError: (err: any) => {
          toast({
            title: "Could not add reason code",
            description: err?.response?.data?.error || err?.message || "Unknown error",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleToggleReason = (id: number, active: boolean) => {
    updateReason.mutate(
      { id, data: { active } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSuppressionReasonsQueryKey() });
        },
        onError: (err: any) => {
          toast({
            title: "Could not update reason code",
            description: err?.response?.data?.error || err?.message || "Unknown error",
            variant: "destructive",
          });
        },
      },
    );
  };

  if (!isAdmin) {
    // Standard users still need access to their own security tab so they
    // can opt into TOTP. Render a minimal page with only that tab.
    return (
      <div className="space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Account Security</h1>
          <p className="text-muted-foreground text-sm">Manage your two-factor authentication.</p>
        </div>
        <SecuritySettings />
      </div>
    );
  }

  const handleUpdateSetting = (key: string, value: any) => {
    updateSettings.mutate({ data: { [key]: value } }, {
      onSuccess: () => {
        toast({ title: "Settings updated" });
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      }
    });
  };

  const handleAddType = () => {
    if (!newTypeName) return;
    createCampaignType.mutate({ data: { name: newTypeName } }, {
      onSuccess: () => {
        setNewTypeName("");
        toast({ title: "Campaign type added" });
        queryClient.invalidateQueries({ queryKey: getListCampaignTypesQueryKey() });
      }
    });
  };

  const handleAddChannel = () => {
    if (!newChannelName) return;
    createChannel.mutate({ data: { name: newChannelName } }, {
      onSuccess: () => {
        setNewChannelName("");
        toast({ title: "Channel added" });
        queryClient.invalidateQueries({ queryKey: getListChannelsQueryKey() });
      }
    });
  };

  const handleToggleType = (id: number, active: boolean) => {
    updateCampaignType.mutate({ id, data: { active } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCampaignTypesQueryKey() });
      }
    });
  };

  const handleToggleChannel = (id: number, active: boolean) => {
    updateChannel.mutate({ id, data: { active } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListChannelsQueryKey() });
      }
    });
  };

  const handleAddUnit = () => {
    if (!newUnitName) return;
    createOwningUnit.mutate({ data: { name: newUnitName } }, {
      onSuccess: () => {
        setNewUnitName("");
        toast({ title: "Owning unit added" });
        queryClient.invalidateQueries({ queryKey: getListOwningUnitsQueryKey() });
      }
    });
  };

  const handleToggleUnit = (id: number, active: boolean) => {
    updateOwningUnit.mutate({ id, data: { active } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOwningUnitsQueryKey() });
      }
    });
  };

  const handleRetention = () => {
    runRetention.mutate({ data: { olderThan: retentionDate, confirm: true } }, {
      onSuccess: (res) => {
        setRetentionConfirmOpen(false);
        toast({ 
          title: "Retention policy applied", 
          description: `Deleted ${res.campaignsDeleted} campaigns and ${res.touchpointsDeleted} touchpoints.` 
        });
      }
    });
  };

  return (
    <div className="space-y-6 max-w-5xl" data-testid="settings-root">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">System Settings</h1>
        <p className="text-muted-foreground text-sm">Configure system-wide parameters and taxonomy.</p>
      </div>

      <Tabs defaultValue="taxonomy">
        <TabsList className="mb-4">
          <TabsTrigger value="taxonomy">Taxonomy</TabsTrigger>
          <TabsTrigger value="templates">Threshold Templates</TabsTrigger>
          <TabsTrigger value="system">System Parameters</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="security">My Security</TabsTrigger>
          {isSuperAdmin && <TabsTrigger value="sso">Single Sign-On</TabsTrigger>}
          {isSuperAdmin && <TabsTrigger value="retention" className="text-destructive data-[state=active]:text-destructive">Data Retention</TabsTrigger>}
        </TabsList>

        {isSuperAdmin && (
          <TabsContent value="sso" className="space-y-6">
            <SamlSettingsPanel />
          </TabsContent>
        )}

        <TabsContent value="security" className="space-y-6">
          <SecuritySettings />
        </TabsContent>

        <TabsContent value="templates" className="space-y-6">
          <ThresholdTemplatesPanel isSuperAdmin={isSuperAdmin} />
        </TabsContent>

        <TabsContent value="taxonomy" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Campaign Types</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                <Input placeholder="New Campaign Type Name" value={newTypeName} onChange={e => setNewTypeName(e.target.value)} className="max-w-xs" />
                <Button onClick={handleAddType} disabled={!newTypeName || createCampaignType.isPending}><Plus className="h-4 w-4 mr-2" /> Add</Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-[100px] text-right">Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {typesLoading ? <TableRow><TableCell colSpan={2} className="text-center h-24"><Loader2 className="animate-spin h-5 w-5 mx-auto" /></TableCell></TableRow> : 
                  campaignTypes?.map(t => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="text-right">
                        <Switch
                          checked={t.active}
                          onCheckedChange={(checked) => handleToggleType(t.id, checked)}
                          disabled={t.systemDefault && !isSuperAdmin}
                          title={t.systemDefault && !isSuperAdmin ? "System default — only a super admin can change this" : undefined}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Channels</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                <Input placeholder="New Channel Name" value={newChannelName} onChange={e => setNewChannelName(e.target.value)} className="max-w-xs" />
                <Button onClick={handleAddChannel} disabled={!newChannelName || createChannel.isPending}><Plus className="h-4 w-4 mr-2" /> Add</Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-[100px] text-right">Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {channelsLoading ? <TableRow><TableCell colSpan={2} className="text-center h-24"><Loader2 className="animate-spin h-5 w-5 mx-auto" /></TableCell></TableRow> : 
                  channels?.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-right">
                        <Switch
                          checked={c.active}
                          onCheckedChange={(checked) => handleToggleChannel(c.id, checked)}
                          disabled={c.systemDefault && !isSuperAdmin}
                          title={c.systemDefault && !isSuperAdmin ? "System default — only a super admin can change this" : undefined}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Suppression Reason Codes</CardTitle>
              <CardDescription>
                Reason codes appear in the suppression dropdown when staff add a suppression to a campaign.
                Deactivating a code hides it from new entries but preserves history.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-2 mb-4">
                <Input
                  placeholder="Reason name (e.g. Do Not Contact)"
                  value={newReasonName}
                  onChange={(e) => setNewReasonName(e.target.value)}
                  className="max-w-xs"
                />
                <Input
                  placeholder="Optional description"
                  value={newReasonDescription}
                  onChange={(e) => setNewReasonDescription(e.target.value)}
                  className="flex-1 max-w-md"
                />
                <Button onClick={handleAddReason} disabled={!newReasonName.trim() || createReason.isPending}>
                  <Plus className="h-4 w-4 mr-2" /> Add
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-[120px]">Source</TableHead>
                    <TableHead className="w-[100px] text-right">Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reasonsLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center h-24">
                        <Loader2 className="animate-spin h-5 w-5 mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : (
                    reasonCodes?.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.description || "—"}</TableCell>
                        <TableCell>
                          {r.systemDefault ? (
                            <Badge variant="outline" className="text-xs">System default</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">Custom</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Switch
                            checked={r.active}
                            onCheckedChange={(checked) => handleToggleReason(r.id, checked)}
                            disabled={r.systemDefault && !isSuperAdmin}
                            title={
                              r.systemDefault && !isSuperAdmin
                                ? "System default — only a super admin can deactivate this"
                                : undefined
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Owning Units</CardTitle>
              <CardDescription>Units available in the Owning Unit dropdown when creating a campaign.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                <Input placeholder="New Owning Unit Name" value={newUnitName} onChange={e => setNewUnitName(e.target.value)} className="max-w-xs" />
                <Button onClick={handleAddUnit} disabled={!newUnitName || createOwningUnit.isPending}><Plus className="h-4 w-4 mr-2" /> Add</Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-[100px] text-right">Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unitsLoading ? <TableRow><TableCell colSpan={2} className="text-center h-24"><Loader2 className="animate-spin h-5 w-5 mx-auto" /></TableCell></TableRow> :
                  owningUnits?.map(u => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell className="text-right">
                        <Switch
                          checked={u.active}
                          onCheckedChange={(checked) => handleToggleUnit(u.id, checked)}
                          disabled={u.systemDefault && !isSuperAdmin}
                          title={u.systemDefault && !isSuperAdmin ? "System default — only a super admin can change this" : undefined}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Feature Toggles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {settingsLoading ? <Loader2 className="animate-spin h-5 w-5" /> : (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base">Google Sheets Import</Label>
                      <p className="text-sm text-muted-foreground">Allow users to paste Google Sheet URLs for audience uploads.</p>
                    </div>
                    <Switch checked={settings?.googleSheetImportEnabled} onCheckedChange={c => handleUpdateSetting('googleSheetImportEnabled', c)} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base">Global Thresholds</Label>
                      <p className="text-sm text-muted-foreground">Enable system-wide threshold limits (Disabled by default).</p>
                    </div>
                    <Switch checked={settings?.globalThresholdsEnabled} onCheckedChange={c => handleUpdateSetting('globalThresholdsEnabled', c)} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> AI Assist</Label>
                      <p className="text-sm text-muted-foreground">Enable AI-powered audience summaries, cadence suggestions, and reason classification.</p>
                    </div>
                    <Switch checked={settings?.aiAssistEnabled} onCheckedChange={c => handleUpdateSetting('aiAssistEnabled', c)} />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="space-y-6">
          <ChannelCapacityPanel />
        </TabsContent>

        {isSuperAdmin && (
          <TabsContent value="retention" className="space-y-6">
            <RetentionSchedulePanel />
            <Card className="border-destructive">
              <CardHeader>
                <CardTitle className="text-destructive flex items-center"><AlertTriangle className="h-5 w-5 mr-2" /> Data Retention Tool</CardTitle>
                <CardDescription>Permanently remove old campaigns and touchpoints.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4 items-end">
                  <div className="space-y-2 flex-1 max-w-xs">
                    <Label>Delete records older than</Label>
                    <Input type="date" value={retentionDate} onChange={e => setRetentionDate(e.target.value)} />
                  </div>
                  <Button variant="destructive" onClick={() => setRetentionConfirmOpen(true)} disabled={!retentionDate || runRetention.isPending}>
                    Run Deletion
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Dialog open={retentionConfirmOpen} onOpenChange={setRetentionConfirmOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="text-destructive">Confirm Permanent Deletion</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                  <p>You are about to permanently delete all campaigns and touchpoints older than <strong>{retentionDate}</strong>. This action cannot be undone.</p>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setRetentionConfirmOpen(false)}>Cancel</Button>
                  <Button variant="destructive" onClick={handleRetention} disabled={runRetention.isPending}>
                    {runRetention.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Yes, Delete Data
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function ChannelCapacityPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: settings, isLoading } = useGetSettings();
  const { data: channels } = useListChannels();
  const updateSettings = useUpdateSettings();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  // Seed the editor from settings the first time both load.
  const seedKey = settings ? Object.keys(settings.channelCapacity ?? {}).sort().join(",") : "";
  if (settings && !dirty && Object.keys(draft).length === 0 && seedKey !== "") {
    // No-op: rely on user-driven edits. We initialize per-row via the input value fallback below.
  }

  const handleChange = (channelId: number, value: string) => {
    setDirty(true);
    setDraft((prev) => ({ ...prev, [String(channelId)]: value }));
  };

  const handleSave = () => {
    const next: Record<string, number> = { ...(settings?.channelCapacity ?? {}) };
    for (const [k, v] of Object.entries(draft)) {
      const n = v.trim() === "" ? 0 : Number(v);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n) || n > 10_000_000) {
        toast({ title: `Invalid capacity for channel ${k}`, description: "Enter a non-negative whole number ≤ 10,000,000.", variant: "destructive" });
        return;
      }
      if (n === 0) delete next[k];
      else next[k] = n;
    }
    updateSettings.mutate(
      { data: { channelCapacity: next } },
      {
        onSuccess: () => {
          toast({ title: "Channel capacities saved" });
          setDirty(false);
          setDraft({});
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        },
        onError: (err: any) => toast({
          title: "Could not save capacities",
          description: err?.response?.data?.error || err?.message || "Unknown error",
          variant: "destructive",
        }),
      },
    );
  };

  const activeChannels = (channels ?? []).filter((c) => c.active);
  const stored = settings?.channelCapacity ?? {};

  return (
    <Card>
      <CardHeader>
        <CardTitle>Channel Saturation Capacities</CardTitle>
        <CardDescription>
          Per-channel weekly volume capacity used by the Channel Saturation report.
          Leave blank or 0 for "no capacity defined" — the heatmap will use a relative
          shading for that channel instead of capacity ratios.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? <Loader2 className="animate-spin h-5 w-5" /> : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead className="w-[200px] text-right">Touchpoints / week (max)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeChannels.length === 0 ? (
                  <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-6">No active channels.</TableCell></TableRow>
                ) : activeChannels.map((c) => {
                  const key = String(c.id);
                  const stagedRaw = draft[key];
                  const value = stagedRaw !== undefined
                    ? stagedRaw
                    : stored[key] !== undefined ? String(stored[key]) : "";
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          value={value}
                          onChange={(e) => handleChange(c.id, e.target.value)}
                          placeholder="—"
                          className="text-right max-w-[160px] ml-auto"
                          data-testid={`capacity-input-${c.id}`}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={!dirty || updateSettings.isPending}>
                {updateSettings.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Save capacities
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

type ScopeKind = "all" | "channel" | "campaign_type" | "channel_and_type";
type ActionMode = "track" | "flag" | "remove" | "manual";

const ACTION_MODE_LABELS: Record<ActionMode, string> = {
  track: "Track (record but allow)",
  flag: "Flag (warn, allow override)",
  remove: "Remove (auto-suppress over-limit)",
  manual: "Manual (require reviewer decision)",
};

interface TemplateForm {
  name: string;
  description: string;
  maxTouchpoints: string;
  windowDays: string;
  scope: ScopeKind;
  channelId: string;
  campaignTypeId: string;
  actionMode: ActionMode;
}

const NONE_VALUE = "__none__";
const EMPTY_FORM: TemplateForm = {
  name: "",
  description: "",
  maxTouchpoints: "3",
  windowDays: "14",
  scope: "all",
  channelId: "",
  campaignTypeId: "",
  actionMode: "flag",
};

function ThresholdTemplatesPanel({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: templates, isLoading } = useListThresholdTemplates();
  const { data: channels } = useListChannels();
  const { data: campaignTypes } = useListCampaignTypes();
  const createT = useCreateThresholdTemplate();
  const updateT = useUpdateThresholdTemplate();
  const deleteT = useDeleteThresholdTemplate();

  const [form, setForm] = useState<TemplateForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListThresholdTemplatesQueryKey() });

  const buildPayload = (f: TemplateForm) => {
    const max = Number(f.maxTouchpoints);
    const win = Number(f.windowDays);
    if (!Number.isFinite(max) || max < 1) throw new Error("Max touchpoints must be at least 1.");
    if (!Number.isFinite(win) || win < 1) throw new Error("Window days must be at least 1.");

    const needsChannel = f.scope === "channel" || f.scope === "channel_and_type";
    const needsType = f.scope === "campaign_type" || f.scope === "channel_and_type";
    if (needsChannel && !f.channelId) throw new Error("Select a channel for this scope.");
    if (needsType && !f.campaignTypeId) throw new Error("Select a campaign type for this scope.");

    return {
      name: f.name.trim(),
      description: f.description.trim() || undefined,
      maxTouchpoints: max,
      windowDays: win,
      scope: f.scope,
      actionMode: f.actionMode,
      ...(needsChannel ? { channelId: Number(f.channelId) } : {}),
      ...(needsType ? { campaignTypeId: Number(f.campaignTypeId) } : {}),
    };
  };

  const buildUpdatePayload = (f: TemplateForm) => {
    const base = buildPayload(f);
    const needsChannel = f.scope === "channel" || f.scope === "channel_and_type";
    const needsType = f.scope === "campaign_type" || f.scope === "channel_and_type";
    return {
      ...base,
      channelId: needsChannel ? Number(f.channelId) : null,
      campaignTypeId: needsType ? Number(f.campaignTypeId) : null,
    };
  };

  const handleAdd = () => {
    if (!form.name.trim()) return;
    let payload;
    try { payload = buildPayload(form); }
    catch (e: any) { toast({ title: "Check the form", description: e.message, variant: "destructive" }); return; }
    createT.mutate(
      { data: payload },
      {
        onSuccess: () => { toast({ title: "Template added" }); setForm(EMPTY_FORM); invalidate(); },
        onError: (e: any) => toast({ title: "Could not add", description: e?.response?.data?.error || e?.message, variant: "destructive" }),
      },
    );
  };

  const handleSaveEdit = () => {
    if (editingId == null) return;
    let payload;
    try { payload = buildUpdatePayload(form); }
    catch (e: any) { toast({ title: "Check the form", description: e.message, variant: "destructive" }); return; }
    updateT.mutate(
      { id: editingId, data: payload },
      {
        onSuccess: () => { toast({ title: "Template updated" }); setEditingId(null); setForm(EMPTY_FORM); invalidate(); },
        onError: (e: any) => toast({ title: "Could not update", description: e?.response?.data?.error || e?.message, variant: "destructive" }),
      },
    );
  };

  const openEdit = (t: any) => {
    setForm({
      name: t.name,
      description: t.description || "",
      maxTouchpoints: String(t.maxTouchpoints),
      windowDays: String(t.windowDays),
      scope: t.scope as ScopeKind,
      channelId: t.channelId ? String(t.channelId) : "",
      campaignTypeId: t.campaignTypeId ? String(t.campaignTypeId) : "",
      actionMode: t.actionMode as ActionMode,
    });
    setEditingId(t.id);
  };

  const handleToggle = (id: number, active: boolean) => {
    updateT.mutate({ id, data: { active } }, {
      onSuccess: invalidate,
      onError: (e: any) => toast({ title: "Could not update", description: e?.response?.data?.error || e?.message, variant: "destructive" }),
    });
  };

  const handleDelete = (id: number, name: string) => {
    if (!confirm(`Delete template "${name}"? This cannot be undone.`)) return;
    deleteT.mutate({ id }, {
      onSuccess: () => { toast({ title: "Template deleted" }); invalidate(); },
      onError: (e: any) => toast({ title: "Could not delete", description: e?.response?.data?.error || e?.message, variant: "destructive" }),
    });
  };

  const channelName = (id?: number | null) => channels?.find((c) => c.id === id)?.name || "—";
  const typeName = (id?: number | null) => campaignTypes?.find((t) => t.id === id)?.name || "—";

  const needsChannel = form.scope === "channel" || form.scope === "channel_and_type";
  const needsType = form.scope === "campaign_type" || form.scope === "channel_and_type";
  const activeChannels = (channels ?? []).filter((c) => c.active);
  const activeCampaignTypes = (campaignTypes ?? []).filter((t) => t.active);

  const formFields = (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label>Name</Label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Standard 3-per-14" />
      </div>
      <div className="space-y-2">
        <Label>Description (optional)</Label>
        <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Internal note" />
      </div>
      <div className="space-y-2">
        <Label>Max Touchpoints</Label>
        <Input type="number" min="1" value={form.maxTouchpoints} onChange={(e) => setForm({ ...form, maxTouchpoints: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label>Window (Days)</Label>
        <Input type="number" min="1" value={form.windowDays} onChange={(e) => setForm({ ...form, windowDays: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label>Scope</Label>
        <Select value={form.scope} onValueChange={(v) => setForm({ ...form, scope: v as ScopeKind, channelId: "", campaignTypeId: "" })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All touches</SelectItem>
            <SelectItem value="channel">Channel-specific</SelectItem>
            <SelectItem value="campaign_type">Campaign type-specific</SelectItem>
            <SelectItem value="channel_and_type">Channel + campaign type</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Action</Label>
        <Select value={form.actionMode} onValueChange={(v) => setForm({ ...form, actionMode: v as ActionMode })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(ACTION_MODE_LABELS) as ActionMode[]).map((m) => (
              <SelectItem key={m} value={m}>{ACTION_MODE_LABELS[m]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {needsChannel && (
        <div className="space-y-2">
          <Label>Channel</Label>
          <Select value={form.channelId || NONE_VALUE} onValueChange={(v) => setForm({ ...form, channelId: v === NONE_VALUE ? "" : v })}>
            <SelectTrigger><SelectValue placeholder="Select a channel" /></SelectTrigger>
            <SelectContent>
              {activeChannels.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      {needsType && (
        <div className="space-y-2">
          <Label>Campaign Type</Label>
          <Select value={form.campaignTypeId || NONE_VALUE} onValueChange={(v) => setForm({ ...form, campaignTypeId: v === NONE_VALUE ? "" : v })}>
            <SelectTrigger><SelectValue placeholder="Select a campaign type" /></SelectTrigger>
            <SelectContent>
              {activeCampaignTypes.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Threshold Templates</CardTitle>
        <CardDescription>
          Reusable threshold rules that can be applied to any campaign with one click. System defaults cannot be deleted; only super admins can deactivate them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {editingId == null && (
          <div className="border p-4 rounded-md space-y-4">
            <h3 className="font-semibold text-sm">Add New Template</h3>
            {formFields}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setForm(EMPTY_FORM)} disabled={createT.isPending}>Reset</Button>
              <Button onClick={handleAdd} disabled={!form.name.trim() || createT.isPending}>
                {createT.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />} Add Template
              </Button>
            </div>
          </div>
        )}

        <Dialog open={editingId != null} onOpenChange={(o) => { if (!o) { setEditingId(null); setForm(EMPTY_FORM); } }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Threshold Template</DialogTitle>
              <DialogDescription>Update the rule definition. Existing campaigns are not retroactively changed.</DialogDescription>
            </DialogHeader>
            <div className="py-2">{formFields}</div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setEditingId(null); setForm(EMPTY_FORM); }}>Cancel</Button>
              <Button onClick={handleSaveEdit} disabled={!form.name.trim() || updateT.isPending}>
                {updateT.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Limit</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Active</TableHead>
              <TableHead className="text-right w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center h-24"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
            ) : !templates?.length ? (
              <TableRow><TableCell colSpan={7} className="text-center h-24 text-muted-foreground">No templates yet.</TableCell></TableRow>
            ) : (
              templates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="font-medium">{t.name}</div>
                    {t.description && <div className="text-xs text-muted-foreground">{t.description}</div>}
                  </TableCell>
                  <TableCell className="text-sm">{t.maxTouchpoints} per {t.windowDays}d</TableCell>
                  <TableCell className="text-sm capitalize">
                    {t.scope.replace(/_/g, " ")}
                    {(t.scope === "channel" || t.scope === "channel_and_type") && <span className="text-muted-foreground"> · {channelName(t.channelId)}</span>}
                    {(t.scope === "campaign_type" || t.scope === "channel_and_type") && <span className="text-muted-foreground"> · {typeName(t.campaignTypeId)}</span>}
                  </TableCell>
                  <TableCell className="text-sm capitalize">{t.actionMode}</TableCell>
                  <TableCell>
                    {t.systemDefault ? <Badge variant="outline" className="text-xs">System default</Badge> : <span className="text-xs text-muted-foreground">Custom</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Switch
                      checked={t.active}
                      onCheckedChange={(c) => handleToggle(t.id, c)}
                      disabled={t.systemDefault && !isSuperAdmin}
                      title={t.systemDefault && !isSuperAdmin ? "System default — only a super admin can change this" : undefined}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)} aria-label={`Edit ${t.name}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {!t.systemDefault && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(t.id, t.name)} aria-label={`Delete ${t.name}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function RetentionSchedulePanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: schedule, isLoading } = useGetRetentionSchedule();
  const updateSchedule = useUpdateRetentionSchedule();
  const runNow = useRunScheduledRetentionNow();

  const [enabled, setEnabled] = useState(false);
  const [cadence, setCadence] = useState<"daily" | "weekly" | "monthly">("daily");
  const [hour, setHour] = useState(3);
  const [minute, setMinute] = useState(0);
  const [dayOfWeek, setDayOfWeek] = useState<number>(0);
  const [dayOfMonth, setDayOfMonth] = useState<number>(1);
  const [olderThanDays, setOlderThanDays] = useState(365);
  const [dryRunOnly, setDryRunOnly] = useState(true);
  const [seeded, setSeeded] = useState(false);

  // Hydrate the form from the server response exactly once, in an effect so
  // we don't trigger setState during render (React anti-pattern that breaks
  // under StrictMode remounts).
  useEffect(() => {
    if (schedule && !seeded) {
      setEnabled(schedule.enabled);
      setCadence(schedule.cadence);
      setHour(schedule.hour);
      setMinute(schedule.minute);
      setDayOfWeek(schedule.dayOfWeek ?? 0);
      setDayOfMonth(schedule.dayOfMonth ?? 1);
      setOlderThanDays(schedule.olderThanDays);
      setDryRunOnly(schedule.dryRunOnly);
      setSeeded(true);
    }
  }, [schedule, seeded]);

  const handleReauth = (err: any, retry: () => void) => {
    if (err?.response?.data?.code === "reauth_required") {
      window.dispatchEvent(new CustomEvent("ctp:reauth-required", { detail: { retry } }));
      return true;
    }
    return false;
  };

  const handleSave = () => {
    const payload = {
      enabled,
      cadence,
      hour,
      minute,
      dayOfWeek: cadence === "weekly" ? dayOfWeek : null,
      dayOfMonth: cadence === "monthly" ? dayOfMonth : null,
      olderThanDays,
      dryRunOnly,
    };
    updateSchedule.mutate(
      { data: payload },
      {
        onSuccess: () => {
          toast({ title: "Schedule saved" });
          queryClient.invalidateQueries({ queryKey: getGetRetentionScheduleQueryKey() });
        },
        onError: (err: any) => {
          if (handleReauth(err, () => handleSave())) return;
          toast({
            title: "Could not save schedule",
            description: err?.response?.data?.error || err?.message || "Unknown error",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleRunNow = (forceDryRun: boolean) => {
    runNow.mutate(
      { data: { dryRun: forceDryRun ? true : undefined } },
      {
        onSuccess: (res) => {
          toast({
            title: res.result.skipped
              ? `Run skipped (${res.result.skipped})`
              : res.result.dryRun
                ? `Dry run complete — ${res.result.campaignsDeleted} campaigns / ${res.result.touchpointsDeleted} touchpoints would be deleted`
                : `Deleted ${res.result.campaignsDeleted} campaigns and ${res.result.touchpointsDeleted} touchpoints`,
          });
          queryClient.invalidateQueries({ queryKey: getGetRetentionScheduleQueryKey() });
        },
        onError: (err: any) => {
          if (handleReauth(err, () => handleRunNow(forceDryRun))) return;
          if (err?.response?.status === 409) {
            toast({
              title: "Another retention run is in progress",
              variant: "destructive",
            });
            return;
          }
          toast({
            title: "Run failed",
            description: err?.response?.data?.error || err?.message || "Unknown error",
            variant: "destructive",
          });
        },
      },
    );
  };

  if (isLoading || !schedule) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading schedule…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="retention-schedule-panel">
      <CardHeader>
        <CardTitle>Scheduled Retention</CardTitle>
        <CardDescription>
          Run the retention pipeline automatically on a recurring cadence. Defaults to dry-run so an
          operator can review before flipping to live deletion.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-3">
          <Switch checked={enabled} onCheckedChange={setEnabled} id="ret-enabled" />
          <Label htmlFor="ret-enabled">Schedule enabled</Label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
          <div className="space-y-2">
            <Label>Cadence</Label>
            <Select value={cadence} onValueChange={(v) => setCadence(v as typeof cadence)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Time of day (UTC)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={23}
                value={hour}
                onChange={(e) => setHour(Math.max(0, Math.min(23, Number(e.target.value) || 0)))}
                className="w-20"
              />
              <span>:</span>
              <Input
                type="number"
                min={0}
                max={59}
                value={minute}
                onChange={(e) => setMinute(Math.max(0, Math.min(59, Number(e.target.value) || 0)))}
                className="w-20"
              />
            </div>
          </div>

          {cadence === "weekly" && (
            <div className="space-y-2">
              <Label>Day of week</Label>
              <Select value={String(dayOfWeek)} onValueChange={(v) => setDayOfWeek(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d, i) => (
                    <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {cadence === "monthly" && (
            <div className="space-y-2">
              <Label>Day of month (clamped to 28)</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(Math.max(1, Math.min(31, Number(e.target.value) || 1)))}
                className="w-24"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Retain records younger than (days)</Label>
            <Input
              type="number"
              min={1}
              max={36500}
              value={olderThanDays}
              onChange={(e) => setOlderThanDays(Math.max(1, Math.min(36500, Number(e.target.value) || 1)))}
              className="w-32"
            />
          </div>

          <div className="flex items-center gap-3 self-end">
            <Switch checked={dryRunOnly} onCheckedChange={setDryRunOnly} id="ret-dry" />
            <Label htmlFor="ret-dry">Dry-run only (no deletion)</Label>
          </div>
        </div>

        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={updateSchedule.isPending}>
            {updateSchedule.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save schedule
          </Button>
          <Button variant="outline" onClick={() => handleRunNow(true)} disabled={runNow.isPending}>
            Run dry-run now
          </Button>
          <Button
            variant="destructive"
            onClick={() => handleRunNow(false)}
            disabled={runNow.isPending || dryRunOnly}
            title={dryRunOnly ? "Disable dry-run-only to run a live deletion." : undefined}
          >
            {runNow.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Run now
          </Button>
        </div>

        <div className="rounded border bg-muted/30 px-4 py-3 text-sm space-y-1">
          <div>
            <span className="text-muted-foreground">Next scheduled run:&nbsp;</span>
            <strong>{schedule.nextRunAt ? new Date(schedule.nextRunAt).toLocaleString() : "—"}</strong>
          </div>
          <div>
            <span className="text-muted-foreground">Last run:&nbsp;</span>
            <strong>{schedule.lastRunAt ? new Date(schedule.lastRunAt).toLocaleString() : "never"}</strong>
            {schedule.lastRunResult && (
              <span className="ml-2 text-muted-foreground">
                ({schedule.lastRunResult.dryRun ? "dry-run" : "live"} —{" "}
                {schedule.lastRunResult.campaignsDeleted} campaigns,{" "}
                {schedule.lastRunResult.touchpointsDeleted} touchpoints
                {schedule.lastRunResult.skipped ? `, skipped: ${schedule.lastRunResult.skipped}` : ""}
                {schedule.lastRunResult.error ? `, error: ${schedule.lastRunResult.error}` : ""}
                )
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
