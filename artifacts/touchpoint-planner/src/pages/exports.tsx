import { useGetExportHistory, useGetUploadHistory } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Link } from "wouter";

const SOURCE_LABELS: Record<string, string> = {
  paste: "Pasted text",
  text: "Pasted text",
  file: "File upload",
  csv: "File upload",
  sheet: "Google Sheet",
  google_sheet: "Google Sheet",
};

function formatSource(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

export default function Exports() {
  const { data: exports, isLoading: exportsLoading } = useGetExportHistory();
  const { data: uploads, isLoading: uploadsLoading } = useGetUploadHistory();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Exports & Uploads</h1>
        <p className="text-muted-foreground text-sm">History of file transfers in and out of the system.</p>
      </div>

      <Tabs defaultValue="exports">
        <TabsList className="mb-4">
          <TabsTrigger value="exports">Export History</TabsTrigger>
          <TabsTrigger value="uploads">Upload History</TabsTrigger>
        </TabsList>

        <TabsContent value="exports">
          <Card>
            <CardHeader>
              <CardTitle>Generated Campaign Exports</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">File Name</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Exported By</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Rows</TableHead>
                    <TableHead className="pr-6 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exportsLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={`exp-sk-${i}`} aria-hidden>
                        <TableCell className="pl-6"><Skeleton className="h-4 w-44" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                        <TableCell className="pr-6 text-right"><Skeleton className="h-4 w-8 ml-auto" /></TableCell>
                      </TableRow>
                    ))
                  ) : exports?.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">No exports found.</TableCell></TableRow>
                  ) : exports?.map(job => (
                    <TableRow key={job.id}>
                      <TableCell className="pl-6 font-mono text-xs">{job.fileName}</TableCell>
                      <TableCell>
                        <Link href={`/campaigns/${job.campaignId}`} className="text-primary hover:underline font-medium">
                          {job.campaignName}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">{job.exportedByName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{format(new Date(job.exportedAt), "MMM d, yyyy HH:mm")}</TableCell>
                      <TableCell className="text-right">{job.rowCount.toLocaleString()}</TableCell>
                      <TableCell className="pr-6 text-right">
                        <Button variant="ghost" size="sm" asChild>
                          {/* We don't have download URLs in the job object by default based on the schema, so we fake the action or build the route */}
                          <a href={`/api/campaigns/${job.campaignId}/exports/${job.touchId || 'all'}.csv`} download>
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="uploads">
          <Card>
            <CardHeader>
              <CardTitle>Audience Uploads</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Campaign</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Uploaded By</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Valid Rows</TableHead>
                    <TableHead className="pr-6 text-right">Rejected</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {uploadsLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={`upl-sk-${i}`} aria-hidden>
                        <TableCell className="pl-6"><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                        <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                        <TableCell className="pr-6"><Skeleton className="h-4 w-32" /></TableCell>
                      </TableRow>
                    ))
                  ) : uploads?.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">No uploads found.</TableCell></TableRow>
                  ) : uploads?.map(job => (
                    <TableRow key={job.id}>
                      <TableCell className="pl-6 font-medium">
                        <Link href={`/campaigns/${job.campaignId}`} className="text-primary hover:underline">
                          {job.campaignName}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span className="bg-muted px-2 py-1 rounded text-xs" title={job.source}>{formatSource(job.source)}</span>
                      </TableCell>
                      <TableCell className="text-sm">{job.uploadedByName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{format(new Date(job.uploadedAt), "MMM d, yyyy HH:mm")}</TableCell>
                      <TableCell className="text-right text-emerald-600 font-medium">{job.validCount.toLocaleString()}</TableCell>
                      <TableCell className="pr-6 text-right text-destructive">{job.rejectedCount > 0 ? job.rejectedCount.toLocaleString() : '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
