import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useCreateCampaign, useUpdateCampaign, useListCampaignTypes, useListOwningUnits, getListCampaignsQueryKey, getGetCampaignQueryKey } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { PiiWarning } from "@/components/ui/PiiWarning";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { AiBriefPanel, type BriefExtraction } from "@/components/ai-brief-panel";
import { useGetSettings } from "@workspace/api-client-react";

const setupSchema = z.object({
  name: z.string().min(1, "Name is required"),
  owningUnit: z.string().optional(),
  intendedSendStartDate: z.string().optional(),
  salesforceCampaignId: z.string().optional(),
  internalNotes: z.string().optional(),
  campaignTypeIds: z.array(z.number()).min(1, "Select at least one campaign type"),
});

export default function SetupStep({ campaign }: { campaign: any }) {
  const isNew = !campaign;
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: campaignTypes, isLoading: typesLoading } = useListCampaignTypes();
  const { data: owningUnits } = useListOwningUnits();

  const form = useForm<z.infer<typeof setupSchema>>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      name: campaign?.name || "",
      owningUnit: campaign?.owningUnit || "",
      intendedSendStartDate: campaign?.intendedSendStartDate ? new Date(campaign.intendedSendStartDate).toISOString().split('T')[0] : "",
      salesforceCampaignId: campaign?.salesforceCampaignId || "",
      internalNotes: campaign?.internalNotes || "",
      campaignTypeIds: campaign?.campaignTypes?.map((t: any) => t.id) || [],
    },
  });

  const createMutation = useCreateCampaign();
  const updateMutation = useUpdateCampaign();

  const onSubmit = (data: z.infer<typeof setupSchema>) => {
    const formattedData = {
      ...data,
      intendedSendStartDate: data.intendedSendStartDate ? new Date(data.intendedSendStartDate).toISOString() : null,
    };

    if (isNew) {
      createMutation.mutate({ data: formattedData as any }, {
        onSuccess: (newCampaign) => {
          queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
          toast({ title: "Campaign created" });
          setLocation(`/campaigns/${newCampaign.id}/edit?step=touches`);
        }
      });
    } else {
      updateMutation.mutate({ id: campaign.id, data: formattedData as any }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaign.id) });
          toast({ title: "Campaign updated" });
          setLocation(`/campaigns/${campaign.id}/edit?step=touches`);
        }
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const { data: appSettings } = useGetSettings();
  const aiAssistEnabled = !!appSettings?.aiAssistEnabled;

  const handleApplyBrief = (extraction: BriefExtraction) => {
    if (extraction.name) form.setValue("name", extraction.name, { shouldDirty: true });
    if (extraction.owningUnit) form.setValue("owningUnit", extraction.owningUnit, { shouldDirty: true });
    if (extraction.intendedSendStartDate) form.setValue("intendedSendStartDate", extraction.intendedSendStartDate, { shouldDirty: true });
    if (extraction.campaignTypeIds.length > 0) form.setValue("campaignTypeIds", extraction.campaignTypeIds, { shouldDirty: true });
  };

  return (
    <div className="space-y-4">
      {isNew && aiAssistEnabled && <AiBriefPanel onApply={handleApplyBrief} />}
      <Card>
      <CardContent className="pt-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Campaign Name *</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="owningUnit"
                render={({ field }) => {
                  const activeUnits = (owningUnits ?? []).filter(u => u.active);
                  const currentValue = field.value ?? "";
                  const selectValue = currentValue || "__none__";
                  // If editing a campaign whose stored unit is now inactive/deleted, still show it as a disabled option
                  const showLegacy = currentValue && !activeUnits.some(u => u.name === currentValue);
                  return (
                    <FormItem>
                      <FormLabel>Owning Unit</FormLabel>
                      <Select value={selectValue} onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">— None —</SelectItem>
                          {activeUnits.map(u => (
                            <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>
                          ))}
                          {showLegacy && (
                            <SelectItem value={currentValue} disabled>{currentValue} (inactive)</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <FormField
                control={form.control}
                name="intendedSendStartDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Intended Send Start Date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="campaignTypeIds"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Campaign Types *</FormLabel>
                    <p className="text-xs text-muted-foreground -mt-1">
                      Select all that apply — tap each type to toggle it on or off. {(field.value?.length ?? 0) > 0 && (
                        <span className="font-medium text-foreground">{field.value!.length} selected.</span>
                      )}
                    </p>
                    <FormControl>
                      <div className="flex flex-wrap gap-2" role="group" aria-label="Campaign types (multi-select)">
                        {typesLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> :
                          campaignTypes?.filter(t => t.active).map(t => {
                            const selected = (field.value || []).includes(t.id);
                            return (
                              <button
                                key={t.id}
                                type="button"
                                role="checkbox"
                                aria-checked={selected}
                                onClick={() => {
                                  const current = field.value || [];
                                  const next = current.includes(t.id)
                                    ? current.filter(id => id !== t.id)
                                    : [...current, t.id];
                                  field.onChange(next);
                                }}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border transition-colors ${
                                  selected
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-background text-muted-foreground border-input hover:bg-muted hover:text-foreground"
                                }`}
                              >
                                <span
                                  aria-hidden="true"
                                  className={`inline-flex items-center justify-center h-4 w-4 rounded-sm border text-[10px] leading-none ${
                                    selected
                                      ? "bg-primary-foreground/20 border-primary-foreground/40 text-primary-foreground"
                                      : "border-muted-foreground/40 text-transparent"
                                  }`}
                                >
                                  ✓
                                </span>
                                {t.name}
                              </button>
                            );
                          })
                        }
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="salesforceCampaignId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Salesforce Campaign ID</FormLabel>
                    <FormControl><Input className="font-mono text-sm" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="internalNotes"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Internal Notes</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                    <PiiWarning text={field.value || ""} />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {isNew ? "Create Campaign & Continue" : "Save & Continue"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
      </Card>
    </div>
  );
}
