import { useMemo, useState } from "react";
import { useListThresholds, useCreateThreshold, useUpdateThreshold, useDeleteThreshold, usePreviewThresholds, useSetThresholdOverrides, useListChannels, useCreateSuppression, useListThresholdTemplates, useApplyThresholdTemplates, getListThresholdsQueryKey, getListSuppressionsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, Trash2, Pencil, RefreshCw, Info, Search, ArrowUpDown, ArrowUp, ArrowDown, ShieldOff, Wand2 } from "lucide-react";
import { AiSuggestReasonPopover } from "@/components/ai-suggest-reason-popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

const ACTION_MODES = [
  { value: "track", label: "Track Only", description: "Record the touchpoint count but take no action — useful for monitoring without interrupting sends." },
  { value: "flag", label: "Flag", description: "Mark constituents over the limit as conflicts in the preview, but keep them in the send list unless overridden." },
  { value: "remove", label: "Remove Flagged", description: "Automatically exclude any constituent over the limit from the export. Use for hard caps." },
  { value: "manual", label: "Manual Review", description: "Pause flagged constituents for an explicit reviewer decision before they can be exported." },
] as const;

export default function ThresholdsStep({ campaign }: { campaign: any }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: thresholds, isLoading: thresholdsLoading } = useListThresholds(campaign.id);
  const { data: channels } = useListChannels();
  const activeChannels = channels?.filter(c => c.active) || [];
  const activeCampaignTypes = campaign.campaignTypes || [];

  const { data: templates } = useListThresholdTemplates();
  const activeTemplates = (templates ?? []).filter((t: any) => t.active);
  const applyTemplates = useApplyThresholdTemplates();

  const handleApplyDefaults = () => {
    applyTemplates.mutate({ id: campaign.id }, {
      onSuccess: (res: any) => {
        toast({
          title: "Defaults applied",
          description: `Created ${res.created} new rule${res.created === 1 ? "" : "s"}, skipped ${res.skipped} duplicate${res.skipped === 1 ? "" : "s"}.`,
        });
        queryClient.invalidateQueries({ queryKey: getListThresholdsQueryKey(campaign.id) });
      },
      onError: (err: any) => {
        toast({ title: "Failed to apply templates", description: err?.response?.data?.error || String(err?.message ?? err), variant: "destructive" });
      },
    });
  };

  const createMutation = useCreateThreshold();
  const updateMutation = useUpdateThreshold();
  const deleteMutation = useDeleteThreshold();
  const previewMutation = usePreviewThresholds();
  const overrideMutation = useSetThresholdOverrides();
  const suppressMutation = useCreateSuppression();

  const [form, setForm] = useState({
    name: "",
    maxTouchpoints: "3",
    windowDays: "14",
    scope: "all" as any,
    channelId: "",
    campaignTypeId: "",
    actionMode: "track" as any
  });

  const [previewData, setPreviewData] = useState<any>(null);
  const [selectedOverrides, setSelectedOverrides] = useState<string[]>([]);

  const [filterSearch, setFilterSearch] = useState("");
  const [filterThreshold, setFilterThreshold] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "flagged" | "overridden">("all");
  const [sortKey, setSortKey] = useState<"donorId" | "thresholdName" | "status">("donorId");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const uniqueThresholdNames = useMemo<string[]>(() => {
    const s = new Set<string>();
    for (const c of (previewData?.conflicts ?? []) as any[]) s.add(c.thresholdName);
    return Array.from(s).sort();
  }, [previewData]);

  const visibleConflicts = useMemo<any[]>(() => {
    if (!previewData?.conflicts) return [];
    let arr = [...(previewData.conflicts as any[])];
    const q = filterSearch.trim();
    if (q) arr = arr.filter((c) => c.donorId.includes(q));
    if (filterThreshold !== "all") arr = arr.filter((c) => c.thresholdName === filterThreshold);
    if (filterStatus !== "all") arr = arr.filter((c) => (filterStatus === "overridden" ? c.overridden : !c.overridden));
    arr.sort((a, b) => {
      let av: string; let bv: string;
      if (sortKey === "status") { av = a.overridden ? "1" : "0"; bv = b.overridden ? "1" : "0"; }
      else { av = String(a[sortKey] ?? ""); bv = String(b[sortKey] ?? ""); }
      const cmp = av.localeCompare(bv, undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [previewData, filterSearch, filterThreshold, filterStatus, sortKey, sortDir]);

  const visibleSelectableIds = visibleConflicts.filter((c) => !c.overridden).map((c) => c.donorId as string);
  const allVisibleSelected = visibleSelectableIds.length > 0 && visibleSelectableIds.every((id) => selectedOverrides.includes(id));

  const sortIcon = (key: typeof sortKey) => {
    if (sortKey !== key) return <ArrowUpDown className="h-3 w-3 ml-1 inline opacity-50" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1 inline" /> : <ArrowDown className="h-3 w-3 ml-1 inline" />;
  };

  const handleSuppress = (donorIds: string[]) => {
    const unique = Array.from(new Set(donorIds));
    if (unique.length === 0) return;
    suppressMutation.mutate(
      { id: campaign.id, data: { scope: "all", reason: "Removed from threshold review", rawText: unique.join("\n") } as any },
      {
        onSuccess: () => {
          toast({ title: `Removed ${unique.length} constituent(s) from campaign` });
          queryClient.invalidateQueries({ queryKey: getListSuppressionsQueryKey(campaign.id) });
          setSelectedOverrides((prev) => prev.filter((id) => !unique.includes(id)));
          handlePreview();
        },
        onError: (err: any) => {
          toast({ title: "Failed to remove", description: String(err?.message ?? err), variant: "destructive" });
        },
      },
    );
  };

  const toggleSelectId = (donorId: string, checked: boolean) => {
    setSelectedOverrides((prev) => {
      if (checked) return prev.includes(donorId) ? prev : [...prev, donorId];
      return prev.filter((id) => id !== donorId);
    });
  };

  const uniqueSelectedCount = useMemo(() => new Set(selectedOverrides).size, [selectedOverrides]);

  const handleAdd = () => {
    const data = {
      name: form.name,
      maxTouchpoints: Number(form.maxTouchpoints),
      windowDays: Number(form.windowDays),
      scope: form.scope,
      channelId: form.scope === "channel" || form.scope === "channel_and_type" ? Number(form.channelId) : undefined,
      campaignTypeId: form.scope === "campaign_type" || form.scope === "channel_and_type" ? Number(form.campaignTypeId) : undefined,
      actionMode: form.actionMode
    };

    createMutation.mutate({ id: campaign.id, data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListThresholdsQueryKey(campaign.id) });
        setForm({ ...form, name: "" }); // Reset name at least
      }
    });
  };

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    maxTouchpoints: "3",
    windowDays: "14",
    scope: "all" as any,
    channelId: "",
    campaignTypeId: "",
    actionMode: "track" as any,
  });

  const handleEdit = (t: any) => {
    setEditingId(t.id);
    setEditForm({
      name: t.name,
      maxTouchpoints: String(t.maxTouchpoints),
      windowDays: String(t.windowDays),
      scope: t.scope,
      channelId: t.channelId != null ? String(t.channelId) : "",
      campaignTypeId: t.campaignTypeId != null ? String(t.campaignTypeId) : "",
      actionMode: t.actionMode,
    });
  };

  const isEditFormValid = editForm.name && editForm.maxTouchpoints && editForm.windowDays &&
    (editForm.scope === "all" ||
     (editForm.scope === "channel" && editForm.channelId) ||
     (editForm.scope === "campaign_type" && editForm.campaignTypeId) ||
     (editForm.scope === "channel_and_type" && editForm.channelId && editForm.campaignTypeId));

  const handleSaveEdit = () => {
    if (editingId == null) return;
    const data = {
      name: editForm.name,
      maxTouchpoints: Number(editForm.maxTouchpoints),
      windowDays: Number(editForm.windowDays),
      scope: editForm.scope,
      channelId: editForm.scope === "channel" || editForm.scope === "channel_and_type" ? Number(editForm.channelId) : undefined,
      campaignTypeId: editForm.scope === "campaign_type" || editForm.scope === "channel_and_type" ? Number(editForm.campaignTypeId) : undefined,
      actionMode: editForm.actionMode,
    };
    updateMutation.mutate(
      { id: campaign.id, thresholdId: editingId, data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListThresholdsQueryKey(campaign.id) });
          setEditingId(null);
          setPreviewData(null);
          setSelectedOverrides([]);
          toast({ title: "Rule updated", description: "Preview cleared — recalculate to see updated conflicts." });
        },
        onError: (err: any) => {
          toast({ title: "Failed to update rule", description: String(err?.message ?? err), variant: "destructive" });
        },
      },
    );
  };

  const handleDelete = (thresholdId: number) => {
    deleteMutation.mutate({ id: campaign.id, thresholdId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListThresholdsQueryKey(campaign.id) });
        setPreviewData(null);
        setSelectedOverrides([]);
      },
    });
  };

  const handlePreview = () => {
    previewMutation.mutate({ id: campaign.id }, {
      onSuccess: (data) => {
        setPreviewData(data);
        setSelectedOverrides([]);
      }
    });
  };

  const handleSaveOverrides = () => {
    const unique = Array.from(new Set(selectedOverrides));
    overrideMutation.mutate({ id: campaign.id, data: { donorIds: unique } }, {
      onSuccess: () => {
        toast({ title: "Overrides saved" });
        handlePreview(); // Refresh preview
      }
    });
  };

  const isFormValid = form.name && form.maxTouchpoints && form.windowDays && 
    (form.scope === "all" || 
     (form.scope === "channel" && form.channelId) || 
     (form.scope === "campaign_type" && form.campaignTypeId) || 
     (form.scope === "channel_and_type" && form.channelId && form.campaignTypeId));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Threshold Rules</CardTitle>
          <CardDescription>Configure communication volume limits for this campaign's audience.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-blue-50 border border-blue-100 p-4 rounded-md flex gap-3 text-blue-800 text-sm">
            <Info className="h-5 w-5 shrink-0" />
            <div>
              <p>A threshold checks any rolling window (e.g. 14 days) that includes each selected send date. This includes other planned touches in this campaign and previously exported touchpoints across the system.</p>
            </div>
          </div>

          {activeTemplates.length > 0 && (
            <div className="border border-primary/30 bg-primary/5 p-4 rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-sm">
                <div className="font-semibold flex items-center gap-2"><Wand2 className="h-4 w-4 text-primary" /> Apply default templates</div>
                <p className="text-muted-foreground mt-0.5">
                  Copy {activeTemplates.length} active template{activeTemplates.length === 1 ? "" : "s"} into this campaign. Existing rules with the same name are skipped.
                </p>
              </div>
              <Button onClick={handleApplyDefaults} disabled={applyTemplates.isPending} variant="default">
                {applyTemplates.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />} Apply Defaults
              </Button>
            </div>
          )}

          <div className="border p-4 rounded-md space-y-4">
            <h3 className="font-semibold text-sm">Add New Threshold</h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Rule Name</Label>
                <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Max 3 per 14 days" />
              </div>
              <div className="space-y-2">
                <Label>Max Touchpoints</Label>
                <Input type="number" min="1" value={form.maxTouchpoints} onChange={e => setForm({...form, maxTouchpoints: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Window (Days)</Label>
                <Input type="number" min="1" value={form.windowDays} onChange={e => setForm({...form, windowDays: e.target.value})} />
              </div>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label>Scope</Label>
                <RadioGroup value={form.scope} onValueChange={v => setForm({...form, scope: v as any})}>
                  <div className="flex items-center space-x-2"><RadioGroupItem value="all" id="scope-all" /><Label htmlFor="scope-all">All Communications</Label></div>
                  <div className="flex items-center space-x-2"><RadioGroupItem value="channel" id="scope-channel" /><Label htmlFor="scope-channel">Specific Channel</Label></div>
                  <div className="flex items-center space-x-2"><RadioGroupItem value="campaign_type" id="scope-type" /><Label htmlFor="scope-type">Specific Campaign Type</Label></div>
                  <div className="flex items-center space-x-2"><RadioGroupItem value="channel_and_type" id="scope-both" /><Label htmlFor="scope-both">Channel + Type</Label></div>
                </RadioGroup>
              </div>

              <div className="space-y-4">
                {(form.scope === "channel" || form.scope === "channel_and_type") && (
                  <div className="space-y-2">
                    <Label>Channel</Label>
                    <Select value={form.channelId} onValueChange={v => setForm({...form, channelId: v})}>
                      <SelectTrigger><SelectValue placeholder="Select channel" /></SelectTrigger>
                      <SelectContent>
                        {activeChannels.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {(form.scope === "campaign_type" || form.scope === "channel_and_type") && (
                  <div className="space-y-2">
                    <Label>Campaign Type</Label>
                    <Select value={form.campaignTypeId} onValueChange={v => setForm({...form, campaignTypeId: v})}>
                      <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        {activeCampaignTypes.map((t: any) => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <Label>Action Mode</Label>
              <RadioGroup value={form.actionMode} onValueChange={v => setForm({...form, actionMode: v as any})} className="grid sm:grid-cols-2 gap-3">
                {ACTION_MODES.map(m => (
                  <div key={m.value} className="flex items-start space-x-2">
                    <RadioGroupItem value={m.value} id={`action-${m.value}`} className="mt-1" />
                    <div className="space-y-0.5">
                      <Label htmlFor={`action-${m.value}`}>{m.label}</Label>
                      <p className="text-xs text-muted-foreground">{m.description}</p>
                    </div>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleAdd} disabled={!isFormValid || createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />} Add Rule
              </Button>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule Name</TableHead>
                <TableHead>Max</TableHead>
                <TableHead>Window</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Action</TableHead>
                <TableHead className="text-right">Edit / Remove</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {thresholdsLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center h-20"><Loader2 className="h-5 w-5 animate-spin mx-auto text-primary" /></TableCell></TableRow>
              ) : !thresholds?.length ? (
                <TableRow><TableCell colSpan={6} className="text-center h-20 text-muted-foreground">No custom thresholds defined.</TableCell></TableRow>
              ) : (
                thresholds.map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>{t.maxTouchpoints}</TableCell>
                    <TableCell>{t.windowDays} days</TableCell>
                    <TableCell className="capitalize">{t.scope.replace(/_/g, ' ')}</TableCell>
                    <TableCell className="capitalize">{t.actionMode}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(t)} title="Edit rule" aria-label={`Edit rule ${t.name}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(t.id)} title="Remove rule" aria-label={`Remove rule ${t.name}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <Dialog open={editingId !== null} onOpenChange={(open) => { if (!open) setEditingId(null); }}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Edit Threshold Rule</DialogTitle>
                <DialogDescription>Update the rule's limits, scope, or action mode.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-rule-name">Rule Name</Label>
                    <Input id="edit-rule-name" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-rule-max">Max Touchpoints</Label>
                    <Input id="edit-rule-max" type="number" min="1" value={editForm.maxTouchpoints} onChange={e => setEditForm({ ...editForm, maxTouchpoints: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-rule-window">Window (Days)</Label>
                    <Input id="edit-rule-window" type="number" min="1" value={editForm.windowDays} onChange={e => setEditForm({ ...editForm, windowDays: e.target.value })} />
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <Label>Scope</Label>
                    <RadioGroup value={editForm.scope} onValueChange={v => setEditForm({ ...editForm, scope: v as any })}>
                      <div className="flex items-center space-x-2"><RadioGroupItem value="all" id="edit-scope-all" /><Label htmlFor="edit-scope-all">All Communications</Label></div>
                      <div className="flex items-center space-x-2"><RadioGroupItem value="channel" id="edit-scope-channel" /><Label htmlFor="edit-scope-channel">Specific Channel</Label></div>
                      <div className="flex items-center space-x-2"><RadioGroupItem value="campaign_type" id="edit-scope-type" /><Label htmlFor="edit-scope-type">Specific Campaign Type</Label></div>
                      <div className="flex items-center space-x-2"><RadioGroupItem value="channel_and_type" id="edit-scope-both" /><Label htmlFor="edit-scope-both">Channel + Type</Label></div>
                    </RadioGroup>
                  </div>
                  <div className="space-y-4">
                    {(editForm.scope === "channel" || editForm.scope === "channel_and_type") && (
                      <div className="space-y-2">
                        <Label htmlFor="edit-rule-channel">Channel</Label>
                        <Select value={editForm.channelId} onValueChange={v => setEditForm({ ...editForm, channelId: v })}>
                          <SelectTrigger id="edit-rule-channel"><SelectValue placeholder="Select channel" /></SelectTrigger>
                          <SelectContent>
                            {activeChannels.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {(editForm.scope === "campaign_type" || editForm.scope === "channel_and_type") && (
                      <div className="space-y-2">
                        <Label htmlFor="edit-rule-type">Campaign Type</Label>
                        <Select value={editForm.campaignTypeId} onValueChange={v => setEditForm({ ...editForm, campaignTypeId: v })}>
                          <SelectTrigger id="edit-rule-type"><SelectValue placeholder="Select type" /></SelectTrigger>
                          <SelectContent>
                            {activeCampaignTypes.map((t: any) => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-3 pt-2">
                  <Label>Action Mode</Label>
                  <RadioGroup value={editForm.actionMode} onValueChange={v => setEditForm({ ...editForm, actionMode: v as any })} className="grid sm:grid-cols-2 gap-3">
                    {ACTION_MODES.map(m => (
                      <div key={m.value} className="flex items-start space-x-2">
                        <RadioGroupItem value={m.value} id={`edit-action-${m.value}`} className="mt-1" />
                        <div className="space-y-0.5">
                          <Label htmlFor={`edit-action-${m.value}`}>{m.label}</Label>
                          <p className="text-xs text-muted-foreground">{m.description}</p>
                        </div>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                <Button onClick={handleSaveEdit} disabled={!isEditFormValid || updateMutation.isPending}>
                  {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div className="pt-6 border-t flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Run a preview check to see which constituents will trigger thresholds.</p>
            <Button onClick={handlePreview} disabled={previewMutation.isPending} variant="secondary">
              <RefreshCw className={`h-4 w-4 mr-2 ${previewMutation.isPending ? 'animate-spin' : ''}`} />
              Recalculate Preview
            </Button>
          </div>
        </CardContent>
      </Card>

      {previewData && (
        <Card className="border-amber-200">
          <CardHeader className="bg-amber-50/50">
            <CardTitle className="text-amber-800">Threshold Preview Results</CardTitle>
            <div className="flex gap-4 mt-2">
              <div className="text-sm"><span className="text-muted-foreground">Flagged Constituents:</span> <strong className="text-amber-700">{previewData.totalFlaggedDonors}</strong></div>
              <div className="text-sm"><span className="text-muted-foreground">Total Touchpoints:</span> <strong>{previewData.totalProjectedTouchpoints}</strong></div>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            {previewData.conflicts.length > 0 && (
              <div className="flex flex-wrap gap-3 items-end">
                <div className="space-y-1 flex-1 min-w-[180px]">
                  <Label className="text-xs text-muted-foreground">Search Constituent ID</Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={filterSearch}
                      onChange={(e) => setFilterSearch(e.target.value)}
                      placeholder="e.g. 00040921"
                      className="pl-8 font-mono text-sm h-9"
                    />
                  </div>
                </div>
                <div className="space-y-1 min-w-[180px]">
                  <Label className="text-xs text-muted-foreground">Threshold</Label>
                  <Select value={filterThreshold} onValueChange={setFilterThreshold}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All thresholds</SelectItem>
                      {uniqueThresholdNames.map((n) => (
                        <SelectItem key={n} value={n}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 min-w-[140px]">
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="flagged">Flagged</SelectItem>
                      <SelectItem value="overridden">Overridden</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(filterSearch || filterThreshold !== "all" || filterStatus !== "all") && (
                  <Button variant="ghost" size="sm" onClick={() => { setFilterSearch(""); setFilterThreshold("all"); setFilterStatus("all"); }}>
                    Clear
                  </Button>
                )}
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              Showing {visibleConflicts.length} of {previewData.conflicts.length}
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      onCheckedChange={(checked) => {
                        if (checked) {
                          const merged = Array.from(new Set([...selectedOverrides, ...visibleSelectableIds]));
                          setSelectedOverrides(merged);
                        } else {
                          setSelectedOverrides(selectedOverrides.filter((id) => !visibleSelectableIds.includes(id)));
                        }
                      }}
                      checked={allVisibleSelected}
                      disabled={visibleSelectableIds.length === 0}
                    />
                  </TableHead>
                  <TableHead aria-sort={sortKey === "donorId" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                    <button
                      type="button"
                      onClick={() => handleSort("donorId")}
                      className="inline-flex items-center font-medium hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    >
                      Constituent ID{sortIcon("donorId")}
                    </button>
                  </TableHead>
                  <TableHead aria-sort={sortKey === "thresholdName" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                    <button
                      type="button"
                      onClick={() => handleSort("thresholdName")}
                      className="inline-flex items-center font-medium hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    >
                      Threshold{sortIcon("thresholdName")}
                    </button>
                  </TableHead>
                  <TableHead>Explanation</TableHead>
                  <TableHead aria-sort={sortKey === "status" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                    <button
                      type="button"
                      onClick={() => handleSort("status")}
                      className="inline-flex items-center font-medium hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    >
                      Status{sortIcon("status")}
                    </button>
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewData.conflicts.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center h-20 text-muted-foreground">No conflicts detected.</TableCell></TableRow>
                ) : visibleConflicts.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center h-20 text-muted-foreground">No constituents match the current filters.</TableCell></TableRow>
                ) : (
                  visibleConflicts.map((c: any, i: number) => (
                    <TableRow key={`${c.donorId}-${i}`}>
                      <TableCell>
                        <Checkbox
                          checked={selectedOverrides.includes(c.donorId)}
                          onCheckedChange={(checked) => toggleSelectId(c.donorId, !!checked)}
                          disabled={c.overridden}
                          aria-label={`Select constituent ${c.donorId}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-sm">{c.donorId}</TableCell>
                      <TableCell>{c.thresholdName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.explanation}</TableCell>
                      <TableCell>
                        {c.overridden ? <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-1 rounded">Overridden</span> : <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded">Flagged</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          <AiSuggestReasonPopover
                            campaignId={campaign.id}
                            thresholdId={c.thresholdId}
                            projectedCount={c.projectedCount}
                            ariaLabel={`Suggest override reason for constituent ${c.donorId}`}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive h-8 w-8"
                            title="Remove from campaign (add to suppressions)"
                            disabled={suppressMutation.isPending}
                            onClick={() => handleSuppress([c.donorId])}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {uniqueSelectedCount > 0 && (
              <div className="flex flex-wrap gap-2 justify-end pt-4 border-t">
                <span className="text-sm text-muted-foreground self-center mr-auto">
                  {uniqueSelectedCount} constituent(s) selected
                </span>
                <Button variant="outline" onClick={() => setSelectedOverrides([])}>
                  Clear selection
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleSuppress(selectedOverrides)}
                  disabled={suppressMutation.isPending}
                >
                  {suppressMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldOff className="h-4 w-4 mr-2" />}
                  Remove Selected
                </Button>
                <Button onClick={handleSaveOverrides} disabled={overrideMutation.isPending}>
                  {overrideMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Override Selected ({uniqueSelectedCount})
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between pt-4 border-t">
        <Button variant="outline" onClick={() => setLocation(`/campaigns/${campaign.id}/edit?step=audience`)}>Back</Button>
        <Button onClick={() => setLocation(`/campaigns/${campaign.id}/edit?step=suppressions`)}>Proceed to Suppressions</Button>
      </div>
    </div>
  );
}
