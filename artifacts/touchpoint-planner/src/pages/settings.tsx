import { useGetSettings, useUpdateSettings, useListCampaignTypes, useCreateCampaignType, useUpdateCampaignType, useListChannels, useCreateChannel, useUpdateChannel, useListOwningUnits, useCreateOwningUnit, useUpdateOwningUnit, useRunRetentionDelete, useListSuppressionReasons, useCreateSuppressionReason, useUpdateSuppressionReason, getListCampaignTypesQueryKey, getListChannelsQueryKey, getListOwningUnitsQueryKey, getGetSettingsQueryKey, getListSuppressionReasonsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Plus, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

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
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">System Settings</h1>
        <p className="text-muted-foreground text-sm">Configure system-wide parameters and taxonomy.</p>
      </div>

      <Tabs defaultValue="taxonomy">
        <TabsList className="mb-4">
          <TabsTrigger value="taxonomy">Taxonomy</TabsTrigger>
          <TabsTrigger value="system">System Parameters</TabsTrigger>
          {isSuperAdmin && <TabsTrigger value="retention" className="text-destructive data-[state=active]:text-destructive">Data Retention</TabsTrigger>}
        </TabsList>

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
