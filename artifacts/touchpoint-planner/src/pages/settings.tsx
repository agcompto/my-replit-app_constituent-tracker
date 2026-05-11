import { useGetSettings, useUpdateSettings, useListCampaignTypes, useCreateCampaignType, useUpdateCampaignType, useListChannels, useCreateChannel, useUpdateChannel, useListOwningUnits, useCreateOwningUnit, useUpdateOwningUnit, useRunRetentionDelete, useListSuppressionReasons, useCreateSuppressionReason, useUpdateSuppressionReason, useListThresholdTemplates, useCreateThresholdTemplate, useUpdateThresholdTemplate, useDeleteThresholdTemplate, getListCampaignTypesQueryKey, getListChannelsQueryKey, getListOwningUnitsQueryKey, getGetSettingsQueryKey, getListSuppressionReasonsQueryKey, getListThresholdTemplatesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Plus, AlertTriangle, Trash2, Sparkles } from "lucide-react";
import { useState } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil } from "lucide-react";

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
    return <div className="p-8 text-center text-muted-foreground">Access denied.</div>;
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
          {isSuperAdmin && <TabsTrigger value="retention" className="text-destructive data-[state=active]:text-destructive">Data Retention</TabsTrigger>}
        </TabsList>

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

        {isSuperAdmin && (
          <TabsContent value="retention" className="space-y-6">
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
