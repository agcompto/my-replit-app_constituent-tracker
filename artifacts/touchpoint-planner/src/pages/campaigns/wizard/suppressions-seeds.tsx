import { useState } from "react";
import { useListSuppressions, useCreateSuppression, useDeleteSuppression, useListSeeds, useCreateSeedGroup, useDeleteSeedGroup, useListChannels, useListTouches, useListSuppressionReasons, getListSuppressionsQueryKey, getListSeedsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { PiiWarning } from "@/components/ui/PiiWarning";
import { Loader2, Plus, Trash2, ShieldAlert, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

export default function SuppressionsSeedsStep({ campaign }: { campaign: any }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: suppressions, isLoading: suppLoading } = useListSuppressions(campaign.id);
  const { data: seeds, isLoading: seedsLoading } = useListSeeds(campaign.id);
  const { data: channels } = useListChannels();
  const { data: touches } = useListTouches(campaign.id);
  const { data: reasonCodes } = useListSuppressionReasons();
  const activeReasonCodes = (reasonCodes || []).filter((r) => r.active);

  const activeChannels = channels?.filter(c => c.active) || [];
  const activeCampaignTypes = campaign.campaignTypes || [];

  const createSupp = useCreateSuppression();
  const deleteSupp = useDeleteSuppression();
  const createSeed = useCreateSeedGroup();
  const deleteSeed = useDeleteSeedGroup();

  const [suppForm, setSuppForm] = useState({
    scope: "all" as any,
    channelId: "",
    campaignTypeId: "",
    touchId: "",
    reasonCodeId: "",
    notes: "",
    rawText: ""
  });

  const [seedForm, setSeedForm] = useState({
    scope: "all" as any,
    channelId: "",
    touchId: "",
    rawText: ""
  });

  const handleAddSuppression = () => {
    const data = {
      scope: suppForm.scope,
      channelId: suppForm.scope === "channel" ? Number(suppForm.channelId) : undefined,
      campaignTypeId: suppForm.scope === "campaign_type" ? Number(suppForm.campaignTypeId) : undefined,
      touchId: suppForm.scope === "touch" ? Number(suppForm.touchId) : undefined,
      reasonCodeId: suppForm.reasonCodeId ? Number(suppForm.reasonCodeId) : undefined,
      notes: suppForm.notes || undefined,
      rawText: suppForm.rawText
    };

    createSupp.mutate({ id: campaign.id, data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSuppressionsQueryKey(campaign.id) });
        setSuppForm({ ...suppForm, rawText: "", notes: "", reasonCodeId: "" });
      }
    });
  };

  const handleAddSeed = () => {
    const data = {
      scope: seedForm.scope,
      channelId: seedForm.scope === "channel" ? Number(seedForm.channelId) : undefined,
      touchId: seedForm.scope === "touch" ? Number(seedForm.touchId) : undefined,
      rawText: seedForm.rawText
    };

    createSeed.mutate({ id: campaign.id, data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSeedsQueryKey(campaign.id) });
        setSeedForm({ ...seedForm, rawText: "" });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Suppressions Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-destructive" /> Suppressions</CardTitle>
            <CardDescription>Remove specific constituents from exports.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4 border p-4 rounded-md">
              <h3 className="font-semibold text-sm">Add Suppression List</h3>
              
              <div className="space-y-2">
                <Label>Scope</Label>
                <Select value={suppForm.scope} onValueChange={v => setSuppForm({...suppForm, scope: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Campaign Touches</SelectItem>
                    <SelectItem value="channel">Specific Channel</SelectItem>
                    <SelectItem value="campaign_type">Specific Campaign Type</SelectItem>
                    <SelectItem value="touch">Specific Touchpoint</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {suppForm.scope === "channel" && (
                <div className="space-y-2">
                  <Label>Channel</Label>
                  <Select value={suppForm.channelId} onValueChange={v => setSuppForm({...suppForm, channelId: v})}>
                    <SelectTrigger><SelectValue placeholder="Select channel" /></SelectTrigger>
                    <SelectContent>{activeChannels.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}

              {suppForm.scope === "campaign_type" && (
                <div className="space-y-2">
                  <Label>Campaign Type</Label>
                  <Select value={suppForm.campaignTypeId} onValueChange={v => setSuppForm({...suppForm, campaignTypeId: v})}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>{activeCampaignTypes.map((t:any) => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}

              {suppForm.scope === "touch" && (
                <div className="space-y-2">
                  <Label>Touchpoint</Label>
                  <Select value={suppForm.touchId} onValueChange={v => setSuppForm({...suppForm, touchId: v})}>
                    <SelectTrigger><SelectValue placeholder="Select touch" /></SelectTrigger>
                    <SelectContent>{touches?.map((t:any) => <SelectItem key={t.id} value={t.id.toString()}>{t.touchName}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Constituent IDs (Paste)</Label>
                <Textarea className="font-mono text-sm h-24" value={suppForm.rawText} onChange={e => setSuppForm({...suppForm, rawText: e.target.value})} placeholder="Paste IDs here..." />
              </div>

              <div className="space-y-2">
                <Label>Reason</Label>
                <Select
                  value={suppForm.reasonCodeId}
                  onValueChange={(v) => setSuppForm({ ...suppForm, reasonCodeId: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Select a reason code…" /></SelectTrigger>
                  <SelectContent>
                    {activeReasonCodes.map((r) => (
                      <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Reason codes are managed by an administrator under Settings → Suppression Reasons.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Notes (Optional)</Label>
                <Input value={suppForm.notes} onChange={e => setSuppForm({...suppForm, notes: e.target.value})} placeholder="Free-text context (no PII)." />
                <PiiWarning text={suppForm.notes} />
              </div>

              <Button onClick={handleAddSuppression} disabled={!suppForm.rawText.trim() || createSupp.isPending} className="w-full">
                {createSupp.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />} Add Suppressions
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scope</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppLoading ? <TableRow><TableCell colSpan={4} className="text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto text-primary"/></TableCell></TableRow> :
                  !suppressions?.length ? <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground text-sm">No suppressions.</TableCell></TableRow> :
                  suppressions.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="capitalize text-sm">{s.scope.replace('_', ' ')}</TableCell>
                      <TableCell className="text-sm">
                        {s.reasonCodeName || s.reason || (
                          <span className="text-muted-foreground italic">Uncategorized</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">{s.donorIdCount}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteSupp.mutate({ id: campaign.id, suppressionId: s.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSuppressionsQueryKey(campaign.id) })})}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                }
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Seeds Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-emerald-600" /> Seeds</CardTitle>
            <CardDescription>Add IDs to exports without counting toward thresholds.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4 border p-4 rounded-md">
              <h3 className="font-semibold text-sm">Add Seed Group</h3>
              
              <div className="space-y-2">
                <Label>Scope</Label>
                <Select value={seedForm.scope} onValueChange={v => setSeedForm({...seedForm, scope: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Campaign Touches</SelectItem>
                    <SelectItem value="channel">Specific Channel</SelectItem>
                    <SelectItem value="touch">Specific Touchpoint</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {seedForm.scope === "channel" && (
                <div className="space-y-2">
                  <Label>Channel</Label>
                  <Select value={seedForm.channelId} onValueChange={v => setSeedForm({...seedForm, channelId: v})}>
                    <SelectTrigger><SelectValue placeholder="Select channel" /></SelectTrigger>
                    <SelectContent>{activeChannels.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}

              {seedForm.scope === "touch" && (
                <div className="space-y-2">
                  <Label>Touchpoint</Label>
                  <Select value={seedForm.touchId} onValueChange={v => setSeedForm({...seedForm, touchId: v})}>
                    <SelectTrigger><SelectValue placeholder="Select touch" /></SelectTrigger>
                    <SelectContent>{touches?.map((t:any) => <SelectItem key={t.id} value={t.id.toString()}>{t.touchName}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Seed IDs (Paste)</Label>
                <Textarea className="font-mono text-sm h-24" value={seedForm.rawText} onChange={e => setSeedForm({...seedForm, rawText: e.target.value})} placeholder="Paste IDs here..." />
              </div>

              <Button onClick={handleAddSeed} disabled={!seedForm.rawText.trim() || createSeed.isPending} className="w-full">
                {createSeed.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />} Add Seeds
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scope</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {seedsLoading ? <TableRow><TableCell colSpan={3} className="text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto text-primary"/></TableCell></TableRow> :
                  !seeds?.length ? <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground text-sm">No seeds.</TableCell></TableRow> :
                  seeds.map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="capitalize text-sm">{s.scope.replace('_', ' ')}</TableCell>
                      <TableCell className="text-right font-medium">{s.seedCount}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteSeed.mutate({ id: campaign.id, seedId: s.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSeedsQueryKey(campaign.id) })})}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                }
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-between pt-4 border-t">
        <Button variant="outline" onClick={() => setLocation(`/campaigns/${campaign.id}/edit?step=thresholds`)}>Back</Button>
        <Button onClick={() => setLocation(`/campaigns/${campaign.id}/edit?step=preview`)}>Proceed to Preview & Export</Button>
      </div>
    </div>
  );
}
