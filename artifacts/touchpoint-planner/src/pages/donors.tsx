import { useState } from "react";
import { useGetDonorTouchpoints } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { normalizeDonorId } from "@/lib/utils";
import { Search, Loader2, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export default function Donors() {
  const [inputVal, setInputVal] = useState("");
  const [donorId, setDonorId] = useState<string | null>(null);

  // useGetDonorTouchpoints expects a string donorId
  const { data, isLoading, error } = useGetDonorTouchpoints(donorId as any, {
    query: {
      enabled: !!donorId,
      queryKey: ["donor-touchpoints", donorId]
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeDonorId(inputVal);
    if (normalized) {
      setDonorId(normalized);
      setInputVal(normalized); // Update input to show padded version
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Constituent ID Lookup</h1>
        <p className="text-muted-foreground text-sm">View planned and sent communication volume for a specific constituent.</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Enter 8-digit Constituent ID (e.g. 00258155)" 
                  className="pl-9 font-mono"
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                />
              </div>
            </div>
            <Button type="submit" disabled={!inputVal.trim() || isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "Lookup"}
            </Button>
          </form>
          <div className="mt-2 text-xs flex items-center gap-1.5 text-muted-foreground">
            <AlertCircle className="h-3 w-3" />
            <span>Use Constituent ID only. Do not enter names, phone numbers, email addresses, or other unnecessary PII.</span>
          </div>
        </CardContent>
      </Card>

      {donorId && (
        <Card>
          <CardHeader>
            <CardTitle>Touchpoints for <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-primary">{donorId}</span></CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Campaign Type</TableHead>
                <TableHead>Send Date</TableHead>
                <TableHead>Threshold</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`donor-sk-${i}`} aria-hidden>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                  </TableRow>
                ))
              )}
              {error && (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-destructive">
                    Failed to load constituent data.
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && !error && data?.touchpoints?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    No touchpoints found for this Constituent ID.
                  </TableCell>
                </TableRow>
              )}
              {data?.touchpoints?.map((t, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{t.campaignName}</TableCell>
                  <TableCell><StatusBadge status={t.campaignStatus} /></TableCell>
                  <TableCell>{t.channelLabel}</TableCell>
                  <TableCell>{t.campaignTypeLabel}</TableCell>
                  <TableCell>{format(new Date(t.sendDate), "MMM d, yyyy")}</TableCell>
                  <TableCell>
                    {t.countsTowardThreshold ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">Yes</span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10">No</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
