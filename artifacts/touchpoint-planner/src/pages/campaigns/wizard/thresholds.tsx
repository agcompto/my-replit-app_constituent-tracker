import { useState } from "react";
import { useListThresholds, useCreateThreshold, useDeleteThreshold, usePreviewThresholds, useSetThresholdOverrides, useListChannels, getListThresholdsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, Trash2, RefreshCw, Info } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

export default function ThresholdsStep({ campaign }: { campaign: any }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: thresholds, isLoading: thresholdsLoading } = useListThresholds(campaign.id);
  const { data: channels } = useListChannels();
  const activeChannels = channels?.filter(c => c.active) || [];
  const activeCampaignTypes = campaign.campaignTypes || [];

  const createMutation = useCreateThreshold();
  const deleteMutation = useDeleteThreshold();
  const previewMutation = usePreviewThresholds();
  const overrideMutation = useSetThresholdOverrides();

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

  const handleDelete = (thresholdId: number) => {
    deleteMutation.mutate({ id: campaign.id, thresholdId }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListThresholdsQueryKey(campaign.id) })
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
    overrideMutation.mutate({ id: campaign.id, data: { donorIds: selectedOverrides } }, {
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
              <RadioGroup value={form.actionMode} onValueChange={v => setForm({...form, actionMode: v as any})} className="flex gap-4">
                <div className="flex items-center space-x-2"><RadioGroupItem value="track" id="action-track" /><Label htmlFor="action-track">Track Only</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="flag" id="action-flag" /><Label htmlFor="action-flag">Flag</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="remove" id="action-remove" /><Label htmlFor="action-remove">Remove Flagged</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="manual" id="action-manual" /><Label htmlFor="action-manual">Manual Review</Label></div>
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
                <TableHead className="text-right">Remove</TableHead>
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
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(t.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="pt-6 border-t flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Run a preview check to see which donors will trigger thresholds.</p>
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
              <div className="text-sm"><span className="text-muted-foreground">Flagged Donors:</span> <strong className="text-amber-700">{previewData.totalFlaggedDonors}</strong></div>
              <div className="text-sm"><span className="text-muted-foreground">Total Touchpoints:</span> <strong>{previewData.totalProjectedTouchpoints}</strong></div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"><Checkbox onCheckedChange={(checked) => setSelectedOverrides(checked ? previewData.conflicts.map((c: any) => c.donorId) : [])} checked={selectedOverrides.length === previewData.conflicts.length && previewData.conflicts.length > 0} /></TableHead>
                  <TableHead>Donor ID</TableHead>
                  <TableHead>Threshold</TableHead>
                  <TableHead>Explanation</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewData.conflicts.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center h-20 text-muted-foreground">No conflicts detected.</TableCell></TableRow>
                ) : (
                  previewData.conflicts.map((c: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Checkbox 
                          checked={selectedOverrides.includes(c.donorId)} 
                          onCheckedChange={(checked) => {
                            if (checked) setSelectedOverrides([...selectedOverrides, c.donorId]);
                            else setSelectedOverrides(selectedOverrides.filter(id => id !== c.donorId));
                          }}
                          disabled={c.overridden}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-sm">{c.donorId}</TableCell>
                      <TableCell>{c.thresholdName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.explanation}</TableCell>
                      <TableCell>
                        {c.overridden ? <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-1 rounded">Overridden</span> : <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded">Flagged</span>}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            
            {selectedOverrides.length > 0 && (
              <div className="flex justify-end pt-4">
                <Button onClick={handleSaveOverrides} disabled={overrideMutation.isPending}>
                  {overrideMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save {selectedOverrides.length} Override(s)
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
