import { useRoute, useLocation, useSearch } from "wouter";
import SetupStep from "./setup";
import AudienceStep from "./audience";
import TouchesStep from "./touches";
import ThresholdsStep from "./thresholds";
import SuppressionsSeedsStep from "./suppressions-seeds";
import PreviewStep from "./preview";
import { useGetCampaign, useListTouches, getListTouchesQueryKey } from "@workspace/api-client-react";
import { Loader2, ArrowLeft, Check } from "lucide-react";
import { getGetCampaignQueryKey } from "@workspace/api-client-react";

export default function CampaignWizard() {
  const [matchNew] = useRoute("/campaigns/new");
  const [matchEdit, editParams] = useRoute("/campaigns/:id/edit");
  const [, setLocation] = useLocation();
  
  const isNew = matchNew;
  const id = isNew ? null : Number(editParams?.id);
  
  const search = useSearch();
  const stepMatch = new URLSearchParams(search).get("step") || "setup";

  const { data: campaign, isLoading } = useGetCampaign(id as number, {
    query: {
      enabled: !!id,
      queryKey: id ? getGetCampaignQueryKey(id) : ["campaign", "new"],
    }
  });

  const { data: touches } = useListTouches(id as number, {
    query: { enabled: !!id, queryKey: id ? getListTouchesQueryKey(id) : ["touches", "new"] }
  });

  const touchCount = touches?.length ?? 0;
  const audienceUploaded = (campaign?.validIdCount ?? 0) > 0;
  const isFinalized = campaign?.status === "finalized" || campaign?.status === "exported";

  const steps = [
    { id: "setup", label: "Setup", complete: !isNew },
    { id: "touches", label: "Touches", disabled: isNew, complete: touchCount > 0 },
    { id: "audience", label: "Audience", disabled: isNew, complete: audienceUploaded },
    { id: "thresholds", label: "Thresholds", disabled: isNew, complete: false },
    { id: "suppressions", label: "Suppressions & Seeds", disabled: isNew, complete: false },
    { id: "preview", label: "Preview & Export", disabled: isNew, complete: isFinalized },
  ];

  if (!isNew && isLoading) {
    return <div className="flex h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!isNew && !campaign) {
    return <div className="p-8 text-center text-muted-foreground">Campaign not found.</div>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-20">
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <button onClick={() => setLocation(isNew ? "/campaigns" : `/campaigns/${id}`)} className="hover:text-foreground flex items-center">
          <ArrowLeft className="h-4 w-4 mr-1" /> {isNew ? "Back to Campaigns" : "Back to Campaign"}
        </button>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{isNew ? "New Campaign" : `Edit: ${campaign?.name}`}</h1>
        <p className="text-muted-foreground text-sm">Follow the steps to configure your campaign and touchpoints.</p>
      </div>

      <div className="flex items-center space-x-2 overflow-x-auto pb-2 -mx-2 px-2 border-b">
        {steps.map((step, i) => (
          <button
            key={step.id}
            disabled={step.disabled}
            onClick={() => setLocation(`/campaigns/${id}/edit?step=${step.id}`)}
            className={`flex items-center px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-colors ${
              stepMatch === step.id 
                ? "bg-primary text-primary-foreground" 
                : step.disabled 
                  ? "text-muted-foreground/50 cursor-not-allowed" 
                  : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <span
              className={`flex items-center justify-center w-5 h-5 mr-2 rounded-full text-[10px] ${
                stepMatch === step.id
                  ? "bg-primary-foreground/20"
                  : step.complete
                    ? "bg-emerald-600 text-white"
                    : "bg-muted-foreground/20"
              }`}
              aria-label={step.complete ? "completed" : undefined}
            >
              {step.complete && stepMatch !== step.id ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
            </span>
            {step.label}
          </button>
        ))}
      </div>

      <div className="pt-4">
        {stepMatch === "setup" && <SetupStep campaign={campaign} />}
        {stepMatch === "audience" && <AudienceStep campaign={campaign!} />}
        {stepMatch === "touches" && <TouchesStep campaign={campaign!} />}
        {stepMatch === "thresholds" && <ThresholdsStep campaign={campaign!} />}
        {stepMatch === "suppressions" && <SuppressionsSeedsStep campaign={campaign!} />}
        {stepMatch === "preview" && <PreviewStep campaign={campaign!} />}
      </div>
    </div>
  );
}
