import { useRef, useState } from "react";
import {
  useListTouches,
  useCreateTouch,
  useUpdateTouch,
  useDeleteTouch,
  useListChannels,
  useUploadTouchAudience,
  useClearTouchAudience,
  useGetSettings,
  useAiSuggestCadence,
  useGetLastManualDateEdit,
  useUndoManualDateEdit,
  getListTouchesQueryKey,
  getGetLastManualDateEditQueryKey,
} from "@workspace/api-client-react";
import { TouchDateHistoryPopover } from "@/components/touch-date-history-popover";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PiiWarning } from "@/components/ui/PiiWarning";
import { Loader2, Plus, Edit2, Trash2, AlertTriangle, Info, Users, Upload, FileText, X, Download, Sparkles, Undo2, ArrowRight } from "lucide-react";
import { format, isBefore, startOfDay } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { downloadCSV } from "@/lib/utils";

function UndoableManualDateEdit({
  campaignId,
  touchId,
  touchName,
  wizardLocked,
}: {
  campaignId: number;
  touchId: number;
  touchName: string;
  wizardLocked: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data } = useGetLastManualDateEdit(campaignId, touchId, {
    query: {
      queryKey: getGetLastManualDateEditQueryKey(campaignId, touchId),
      enabled: !!campaignId && !!touchId && !wizardLocked,
    },
  });
  const undo = useUndoManualDateEdit();
  if (!data?.available) return null;

  const handleClick = () => {
    undo.mutate(
      { id: campaignId, touchId },
      {
        onSuccess: () => {
          toast({
            title: "Date change undone",
            description: `${touchName}: ${data.to} → ${data.from}`,
          });
          queryClient.invalidateQueries({ queryKey: getGetLastManualDateEditQueryKey(campaignId, touchId) });
          queryClient.invalidateQueries({ queryKey: getListTouchesQueryKey(campaignId) });
        },
        onError: (err: any) => toast({
          title: "Could not undo date change",
          description: err?.response?.data?.error || err?.message || "Unknown error",
          variant: "destructive",
        }),
      },
    );
  };

  return (
    <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
      <span className="font-mono">{data.from}</span>
      <ArrowRight className="h-3 w-3" />
      <span className="font-mono">{data.to}</span>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs"
        onClick={handleClick}
        disabled={undo.isPending}
        title={`Restore previous send date (${data.from})`}
      >
        {undo.isPending
          ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          : <Undo2 className="h-3 w-3 mr-1" />}
        Undo
      </Button>
    </div>
  );
}

interface AudienceUploadResult {
  uniqueCount: number;
  duplicateCount: number;
  rejectedCount: number;
  duplicateSamples: string[];
  rejectedSamples: string[];
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_EXT = [".csv", ".tsv", ".txt"];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result as string;
      const idx = r.indexOf(",");
      resolve(idx >= 0 ? r.slice(idx + 1) : r);
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export default function TouchesStep({ campaign }: { campaign: any }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: touches, isLoading } = useListTouches(campaign.id, {
    query: { queryKey: getListTouchesQueryKey(campaign.id) }
  });
  const { data: channels } = useListChannels();
  const { data: settings } = useGetSettings();

  const createTouch = useCreateTouch();
  const updateTouch = useUpdateTouch();
  const deleteTouch = useDeleteTouch();
  const uploadTouchAudience = useUploadTouchAudience();
  const clearTouchAudience = useClearTouchAudience();
  const suggestCadence = useAiSuggestCadence();
  const [cadence, setCadence] = useState<{ rationale: string; touches: Array<{ order: number; channelLabel: string; dayOffset: number; purpose: string }>; generatedAt: string } | null>(null);
  const [cadenceOpen, setCadenceOpen] = useState(false);

  const handleSuggestCadence = () => {
    setCadenceOpen(true);
    suggestCadence.mutate({ id: campaign.id }, {
      onSuccess: (res) => setCadence(res),
      onError: (err: any) => toast({
        title: "AI suggestion failed",
        description: err?.response?.data?.error || err?.message || "Unknown error",
        variant: "destructive",
      }),
    });
  };

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [form, setForm] = useState({
    touchName: "",
    channelId: "",
    campaignTypeId: "",
    sendDate: "",
    notes: ""
  });

  // Audience override dialog
  const [audienceDialogOpen, setAudienceDialogOpen] = useState(false);
  const [audienceTouch, setAudienceTouch] = useState<any | null>(null);
  const [audRawText, setAudRawText] = useState("");
  const [audSheetUrl, setAudSheetUrl] = useState("");
  const [audFile, setAudFile] = useState<File | null>(null);
  const [audHasHeader, setAudHasHeader] = useState(true);
  const [audColumnIndex, setAudColumnIndex] = useState(0);
  const [audError, setAudError] = useState<string | null>(null);
  const [audLastResult, setAudLastResult] = useState<AudienceUploadResult | null>(null);
  const [audDragOver, setAudDragOver] = useState(false);
  const audFileRef = useRef<HTMLInputElement>(null);

  const acceptDroppedFile = (f: File | undefined) => {
    if (!f) return;
    const lower = f.name.toLowerCase();
    if (!ACCEPTED_EXT.some(ext => lower.endsWith(ext))) {
      setAudError(`Unsupported file type. Accepted: ${ACCEPTED_EXT.join(", ")}`);
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      setAudError("File is too large (max 10 MB).");
      return;
    }
    setAudFile(f);
    setAudError(null);
  };

  const activeChannels = channels?.filter(c => c.active) || [];
  const activeCampaignTypes = campaign.campaignTypes || [];

  const wizardLocked = campaign.status === "finalized" || campaign.status === "exported" || campaign.status === "voided" || campaign.status === "archived";
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListTouchesQueryKey(campaign.id) });
    // After any touch mutation, the latest manual-date-edit availability may
    // have flipped — invalidate every per-touch query for this campaign.
    queryClient.invalidateQueries({ predicate: (q) => {
      const k = q.queryKey?.[0];
      return typeof k === "string" && k.includes("/last-manual-date-edit");
    } });
  };

  const handleOpenNew = () => {
    setEditingId(null);
    setForm({
      touchName: "",
      channelId: "",
      campaignTypeId: activeCampaignTypes.length === 1 ? activeCampaignTypes[0].id.toString() : "",
      sendDate: campaign.intendedSendStartDate ? new Date(campaign.intendedSendStartDate).toISOString().split('T')[0] : "",
      notes: ""
    });
    setDialogOpen(true);
  };

  const handleOpenEdit = (touch: any) => {
    setEditingId(touch.id);
    setForm({
      touchName: touch.touchName,
      channelId: touch.channelId.toString(),
      campaignTypeId: touch.campaignTypeId.toString(),
      sendDate: new Date(touch.sendDate).toISOString().split('T')[0],
      notes: touch.notes || ""
    });
    setDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("Remove this touchpoint? Any per-touch audience list will also be deleted.")) {
      deleteTouch.mutate({ id: campaign.id, touchId: id }, { onSuccess: invalidate });
    }
  };

  const handleSave = () => {
    if (isDuplicate && !confirm("Another touch already uses this channel and send date. Add it anyway?")) {
      return;
    }
    const data = {
      touchName: form.touchName,
      channelId: Number(form.channelId),
      campaignTypeId: Number(form.campaignTypeId),
      sendDate: new Date(form.sendDate).toISOString(),
      notes: form.notes || undefined
    };

    if (editingId) {
      updateTouch.mutate({ id: campaign.id, touchId: editingId, data }, {
        onSuccess: () => { setDialogOpen(false); invalidate(); }
      });
    } else {
      createTouch.mutate({ id: campaign.id, data }, {
        onSuccess: () => { setDialogOpen(false); invalidate(); }
      });
    }
  };

  const openAudienceDialog = (touch: any) => {
    setAudienceTouch(touch);
    setAudRawText("");
    setAudSheetUrl("");
    setAudFile(null);
    setAudHasHeader(true);
    setAudColumnIndex(0);
    setAudError(null);
    setAudLastResult(null);
    setAudienceDialogOpen(true);
  };

  const submitTouchAudience = async (type: "text" | "sheet" | "file") => {
    if (!audienceTouch) return;
    setAudError(null);
    setAudLastResult(null);
    try {
      let payload: any = { hasHeader: audHasHeader, columnIndex: audColumnIndex };
      if (type === "text") payload.rawText = audRawText;
      else if (type === "sheet") payload.googleSheetUrl = audSheetUrl;
      else if (type === "file") {
        if (!audFile) throw new Error("Choose a file first.");
        if (audFile.size > MAX_FILE_BYTES) throw new Error("File is too large (max 10 MB).");
        payload.csvFileBase64 = await fileToBase64(audFile);
        payload.csvFileName = audFile.name;
      }
      uploadTouchAudience.mutate(
        { id: campaign.id, touchId: audienceTouch.id, data: payload },
        {
          onSuccess: (res) => {
            toast({ title: `Per-touch audience saved (${res.uniqueCount.toLocaleString()} unique IDs)` });
            setAudLastResult({
              uniqueCount: res.uniqueCount,
              duplicateCount: res.duplicateCount,
              rejectedCount: res.rejectedCount,
              duplicateSamples: res.duplicateSamples ?? [],
              rejectedSamples: res.rejectedSamples ?? [],
            });
            invalidate();
          },
          onError: (e: any) => {
            setAudError(e?.response?.data?.error ?? e?.message ?? "Upload failed");
          },
        },
      );
    } catch (e) {
      setAudError(e instanceof Error ? e.message : "Upload failed");
    }
  };

  const clearAudience = (touch: any) => {
    if (!confirm(`Remove the per-touch audience for "${touch.touchName}"? This touch will revert to using the campaign-wide audience.`)) return;
    clearTouchAudience.mutate({ id: campaign.id, touchId: touch.id }, {
      onSuccess: () => {
        toast({ title: "Reverted to campaign-wide audience" });
        invalidate();
      },
    });
  };

  const isFormValid = form.touchName && form.channelId && form.campaignTypeId && form.sendDate;
  const isPastDate = form.sendDate && isBefore(new Date(form.sendDate), startOfDay(new Date()));
  const isDuplicate = touches?.some(t =>
    t.id !== editingId &&
    t.channelId.toString() === form.channelId &&
    new Date(t.sendDate).toISOString().split('T')[0] === form.sendDate
  );

  const campaignAudienceMissing = !campaign.validIdCount || campaign.validIdCount === 0;
  const touchesUsingCampaign = (touches ?? []).filter((t: any) => t.audienceMode !== "custom");
  const touchesMissingAudience = campaignAudienceMissing && touchesUsingCampaign.length > 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Touch Builder</CardTitle>
            <CardDescription>
              Define the individual planned communications. Each touch sends to the campaign-wide audience by default, or you can set a per-touch list.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {settings?.aiAssistEnabled && (
              <Button onClick={handleSuggestCadence} size="sm" variant="outline" disabled={suggestCadence.isPending}>
                {suggestCadence.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2 text-primary" />} Suggest Cadence
              </Button>
            )}
            <Button onClick={handleOpenNew} size="sm"><Plus className="h-4 w-4 mr-2"/> Add Touch</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Name</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Send Date</TableHead>
                <TableHead>Audience</TableHead>
                <TableHead className="pr-6 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="h-32 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
              ) : !touches?.length ? (
                <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">No touchpoints defined yet. Add one to get started.</TableCell></TableRow>
              ) : (
                touches.map((t: any) => {
                  const custom = t.audienceMode === "custom";
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="pl-6 font-medium">{t.touchName}</TableCell>
                      <TableCell>{t.channelLabel}</TableCell>
                      <TableCell>{t.campaignTypeLabel}</TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          <span>{format(new Date(t.sendDate), "MMM d, yyyy")}</span>
                          <TouchDateHistoryPopover
                            campaignId={campaign.id}
                            touchId={t.id}
                            touchName={t.touchName}
                          />
                        </div>
                        <UndoableManualDateEdit
                          campaignId={campaign.id}
                          touchId={t.id}
                          touchName={t.touchName}
                          wizardLocked={wizardLocked}
                        />
                      </TableCell>
                      <TableCell>
                        {custom ? (
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/30">
                              Custom · {t.customUniqueIdCount?.toLocaleString() ?? 0}
                            </Badge>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openAudienceDialog(t)}>
                              Replace
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => clearAudience(t)} title="Revert to campaign audience">
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-muted-foreground">Campaign-wide</Badge>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openAudienceDialog(t)}>
                              <Users className="h-3.5 w-3.5 mr-1" /> Set custom
                            </Button>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(t)}><Edit2 className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(t.id)}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {touchesMissingAudience && (
        <div className="bg-blue-50 border border-blue-200 p-3 rounded-md flex gap-3 text-blue-900 text-sm">
          <Info className="h-5 w-5 shrink-0" />
          <div>
            {touchesUsingCampaign.length} of your touch(es) are set to use the campaign-wide audience. You'll upload that list on the next step (Audience), or you can give each touch its own list here.
          </div>
        </div>
      )}

      <div className="flex justify-between pt-4 border-t">
        <Button variant="outline" onClick={() => setLocation(`/campaigns/${campaign.id}/edit?step=setup`)}>Back</Button>
        <Button onClick={() => setLocation(`/campaigns/${campaign.id}/edit?step=audience`)}>Proceed to Audience</Button>
      </div>

      {/* Touch create/edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Touchpoint" : "Add Touchpoint"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="touchName">Touch Name *</label>
              <Input id="touchName" autoFocus value={form.touchName} onChange={e => setForm({...form, touchName: e.target.value})} placeholder="e.g. Email #1 - Announcement" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Channel *</label>
                <Select value={form.channelId} onValueChange={v => setForm({...form, channelId: v})}>
                  <SelectTrigger><SelectValue placeholder="Select channel" /></SelectTrigger>
                  <SelectContent>
                    {activeChannels.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Campaign Type *</label>
                <Select value={form.campaignTypeId} onValueChange={v => setForm({...form, campaignTypeId: v})}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {activeCampaignTypes.map((t: any) => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Send Date *</label>
              <Input type="date" value={form.sendDate} onChange={e => setForm({...form, sendDate: e.target.value})} />
              {isPastDate && (
                <div className="text-xs text-amber-600 flex items-center mt-1"><AlertTriangle className="h-3 w-3 mr-1" /> Warning: Date is in the past.</div>
              )}
              {isDuplicate && (
                <div className="text-xs text-amber-600 flex items-center mt-1"><AlertTriangle className="h-3 w-3 mr-1" /> Warning: Another touch uses this channel and date.</div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Notes</label>
              <Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Internal notes for this specific touch..." />
              <PiiWarning text={form.notes} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!isFormValid || createTouch.isPending || updateTouch.isPending}>
              {(createTouch.isPending || updateTouch.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-2"/>} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Per-touch audience dialog */}
      <Dialog open={audienceDialogOpen} onOpenChange={setAudienceDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Per-Touch Audience{audienceTouch ? `: ${audienceTouch.touchName}` : ""}</DialogTitle>
            <DialogDescription>
              Provide a list of Constituent IDs for just this touch. It will <strong>replace</strong> the campaign-wide list for this touch only — other touches are unaffected.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Tabs defaultValue="paste">
              <TabsList className="mb-4">
                <TabsTrigger value="paste">Paste / CSV Text</TabsTrigger>
                <TabsTrigger value="file"><Upload className="h-4 w-4 mr-1.5" /> Upload CSV</TabsTrigger>
                {settings?.googleSheetImportEnabled && (
                  <TabsTrigger value="sheet">Google Sheet URL</TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="paste" className="space-y-3">
                <Textarea
                  className="font-mono text-sm h-48"
                  placeholder="Paste Constituent IDs here..."
                  value={audRawText}
                  onChange={(e) => setAudRawText(e.target.value)}
                />
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="audHeader1" checked={audHasHeader} onCheckedChange={(c) => setAudHasHeader(!!c)} />
                    <Label htmlFor="audHeader1">First row is header</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Label htmlFor="audCol1">Column index</Label>
                    <Input id="audCol1" type="number" min="0" value={audColumnIndex} onChange={(e) => setAudColumnIndex(Number(e.target.value))} className="w-16" />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => submitTouchAudience("text")} disabled={!audRawText.trim() || uploadTouchAudience.isPending}>
                    {uploadTouchAudience.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Save Audience
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="file" className="space-y-3">
                <div
                  className={`border-2 border-dashed rounded-md p-6 text-center transition-colors ${audDragOver ? "border-primary bg-primary/5" : "border-gray-300 hover:border-primary/60"}`}
                  onDragOver={(e) => { e.preventDefault(); setAudDragOver(true); }}
                  onDragEnter={(e) => { e.preventDefault(); setAudDragOver(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setAudDragOver(false); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setAudDragOver(false);
                    acceptDroppedFile(e.dataTransfer.files?.[0]);
                  }}
                >
                  <input
                    ref={audFileRef}
                    type="file"
                    accept={ACCEPTED_EXT.join(",")}
                    className="hidden"
                    onChange={(e) => { setAudFile(e.target.files?.[0] ?? null); setAudError(null); }}
                  />
                  {audFile ? (
                    <div className="space-y-2">
                      <FileText className="h-8 w-8 mx-auto text-primary" />
                      <p className="font-medium text-sm">{audFile.name}</p>
                      <p className="text-xs text-muted-foreground">{(audFile.size / 1024).toFixed(1)} KB</p>
                      <Button variant="outline" size="sm" onClick={() => { setAudFile(null); if (audFileRef.current) audFileRef.current.value = ""; }}>Choose different file</Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                      <p className="text-sm">Drop a CSV file here or click to browse</p>
                      <p className="text-xs text-muted-foreground">.csv, .tsv, .txt — up to 10 MB</p>
                      <Button variant="outline" size="sm" onClick={() => audFileRef.current?.click()}>Choose File</Button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="audHeader2" checked={audHasHeader} onCheckedChange={(c) => setAudHasHeader(!!c)} />
                    <Label htmlFor="audHeader2">First row is header</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Label htmlFor="audCol2">Column index</Label>
                    <Input id="audCol2" type="number" min="0" value={audColumnIndex} onChange={(e) => setAudColumnIndex(Number(e.target.value))} className="w-16" />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => submitTouchAudience("file")} disabled={!audFile || uploadTouchAudience.isPending}>
                    {uploadTouchAudience.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Save Audience
                  </Button>
                </div>
              </TabsContent>

              {settings?.googleSheetImportEnabled && (
              <TabsContent value="sheet" className="space-y-3">
                <div className="space-y-2">
                  <Label>Google Sheet URL</Label>
                  <Input
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    value={audSheetUrl}
                    onChange={(e) => setAudSheetUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Share as <strong>"Anyone with the link &mdash; Viewer"</strong>.</p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="audHeader3" checked={audHasHeader} onCheckedChange={(c) => setAudHasHeader(!!c)} />
                    <Label htmlFor="audHeader3">First row is header</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Label htmlFor="audCol3">Column index</Label>
                    <Input id="audCol3" type="number" min="0" value={audColumnIndex} onChange={(e) => setAudColumnIndex(Number(e.target.value))} className="w-16" />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => submitTouchAudience("sheet")} disabled={!audSheetUrl.trim() || uploadTouchAudience.isPending}>
                    {uploadTouchAudience.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Import & Save
                  </Button>
                </div>
              </TabsContent>
              )}
            </Tabs>

            {audError && (
              <div className="mt-3 text-sm text-destructive bg-red-50 border border-red-200 rounded p-3">{audError}</div>
            )}

            {audLastResult && (
              <div className="mt-4 border border-emerald-200 bg-emerald-50 rounded p-3 space-y-3">
                <div className="text-sm text-emerald-800">
                  <strong>Saved.</strong> {audLastResult.uniqueCount.toLocaleString()} unique IDs ·{" "}
                  {audLastResult.duplicateCount.toLocaleString()} duplicate(s) ·{" "}
                  {audLastResult.rejectedCount.toLocaleString()} rejected.
                  {(audLastResult.duplicateSamples.length > 0 || audLastResult.rejectedSamples.length > 0) && (
                    <span className="block text-xs text-emerald-700/80 mt-1">
                      Download cleanup lists below — they are only available right now and are not stored on the server.
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {audLastResult.duplicateSamples.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        downloadCSV(
                          "touch-duplicate-ids",
                          audLastResult.duplicateSamples.map((id) => ({ ConstituentID: id })),
                        )
                      }
                    >
                      <Download className="h-4 w-4 mr-2" /> Download Duplicates ({audLastResult.duplicateSamples.length})
                    </Button>
                  )}
                  {audLastResult.rejectedSamples.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        downloadCSV(
                          "touch-rejected-ids",
                          audLastResult.rejectedSamples.map((id) => ({ RawInput: id })),
                        )
                      }
                    >
                      <Download className="h-4 w-4 mr-2" /> Download Rejected ({audLastResult.rejectedSamples.length})
                    </Button>
                  )}
                  <div className="ml-auto">
                    <Button size="sm" onClick={() => setAudienceDialogOpen(false)}>Done</Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={cadenceOpen} onOpenChange={setCadenceOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> Suggested Cadence</DialogTitle>
            <DialogDescription>
              An AI-generated draft based on this campaign's setup. Use it as a starting point — review every touch before adding.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {suggestCadence.isPending ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Drafting cadence…
              </div>
            ) : cadence ? (
              <div className="space-y-4">
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{cadence.rationale}</p>
                <div className="border rounded-md divide-y">
                  {cadence.touches.map((t) => (
                    <div key={t.order} className="flex items-start gap-3 p-3 text-sm">
                      <div className="font-mono text-xs bg-muted rounded px-2 py-1">#{t.order}</div>
                      <div className="flex-1">
                        <div className="font-medium">{t.channelLabel} <span className="text-muted-foreground">· Day +{t.dayOffset}</span></div>
                        <div className="text-muted-foreground text-xs mt-0.5">{t.purpose}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Generated {format(new Date(cadence.generatedAt), "MMM d, yyyy 'at' h:mm a")}</p>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No suggestion available.</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCadenceOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
