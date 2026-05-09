import { useState } from "react";
import { useListTouches, useCreateTouch, useUpdateTouch, useDeleteTouch, useListChannels, getListTouchesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PiiWarning } from "@/components/ui/PiiWarning";
import { Loader2, Plus, Edit2, Trash2, AlertTriangle } from "lucide-react";
import { format, isBefore, startOfDay } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

export default function TouchesStep({ campaign }: { campaign: any }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: touches, isLoading } = useListTouches(campaign.id, {
    query: { queryKey: getListTouchesQueryKey(campaign.id) }
  });
  const { data: channels } = useListChannels();

  const createTouch = useCreateTouch();
  const updateTouch = useUpdateTouch();
  const deleteTouch = useDeleteTouch();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  const [form, setForm] = useState({
    touchName: "",
    channelId: "",
    campaignTypeId: "",
    sendDate: "",
    notes: ""
  });

  const activeChannels = channels?.filter(c => c.active) || [];
  const activeCampaignTypes = campaign.campaignTypes || [];

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
    if (confirm("Remove this touchpoint?")) {
      deleteTouch.mutate({ campaignId: campaign.id, id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTouchesQueryKey(campaign.id) })
      });
    }
  };

  const handleSave = () => {
    const data = {
      touchName: form.touchName,
      channelId: Number(form.channelId),
      campaignTypeId: Number(form.campaignTypeId),
      sendDate: new Date(form.sendDate).toISOString(),
      notes: form.notes || undefined
    };

    if (editingId) {
      updateTouch.mutate({ campaignId: campaign.id, id: editingId, data }, {
        onSuccess: () => {
          setDialogOpen(false);
          queryClient.invalidateQueries({ queryKey: getListTouchesQueryKey(campaign.id) });
        }
      });
    } else {
      createTouch.mutate({ campaignId: campaign.id, data }, {
        onSuccess: () => {
          setDialogOpen(false);
          queryClient.invalidateQueries({ queryKey: getListTouchesQueryKey(campaign.id) });
        }
      });
    }
  };

  const isFormValid = form.touchName && form.channelId && form.campaignTypeId && form.sendDate;
  const isPastDate = form.sendDate && isBefore(new Date(form.sendDate), startOfDay(new Date()));
  const isDuplicate = touches?.some(t => 
    t.id !== editingId && 
    t.channelId.toString() === form.channelId && 
    new Date(t.sendDate).toISOString().split('T')[0] === form.sendDate
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Touch Builder</CardTitle>
            <CardDescription>Define the individual planned communications for this campaign.</CardDescription>
          </div>
          <Button onClick={handleOpenNew} size="sm"><Plus className="h-4 w-4 mr-2"/> Add Touch</Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Name</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Send Date</TableHead>
                <TableHead className="pr-6 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="h-32 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
              ) : !touches?.length ? (
                <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground">No touchpoints defined yet. Add one to get started.</TableCell></TableRow>
              ) : (
                touches.map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="pl-6 font-medium">{t.touchName}</TableCell>
                    <TableCell>{t.channelLabel}</TableCell>
                    <TableCell>{t.campaignTypeLabel}</TableCell>
                    <TableCell>{format(new Date(t.sendDate), "MMM d, yyyy")}</TableCell>
                    <TableCell className="pr-6 text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(t)}><Edit2 className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(t.id)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex justify-between pt-4 border-t">
        <Button variant="outline" onClick={() => setLocation(`/campaigns/${campaign.id}/edit?step=audience`)}>Back</Button>
        <Button onClick={() => setLocation(`/campaigns/${campaign.id}/edit?step=thresholds`)}>Proceed to Thresholds</Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Touchpoint" : "Add Touchpoint"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Touch Name *</label>
              <Input value={form.touchName} onChange={e => setForm({...form, touchName: e.target.value})} placeholder="e.g. Email #1 - Announcement" />
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
    </div>
  );
}
