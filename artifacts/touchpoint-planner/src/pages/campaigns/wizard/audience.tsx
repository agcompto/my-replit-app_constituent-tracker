import { useRef, useState } from "react";
import { useUploadAudience, useGetSettings, getGetCampaignQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Download, AlertTriangle, Info, Upload, FileText } from "lucide-react";
import { downloadCSV } from "@/lib/utils";
import { useLocation } from "wouter";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_EXT = [".csv", ".tsv", ".txt"];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result as string;
      // strip data URI prefix
      const idx = r.indexOf(",");
      resolve(idx >= 0 ? r.slice(idx + 1) : r);
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export default function AudienceStep({ campaign }: { campaign: any }) {
  const { data: settings } = useGetSettings();
  const uploadMutation = useUploadAudience();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [rawText, setRawText] = useState("");
  const [googleSheetUrl, setGoogleSheetUrl] = useState("");
  const [hasHeader, setHasHeader] = useState(true);
  const [columnIndex, setColumnIndex] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onError = (err: unknown) => {
    const msg = err instanceof Error ? err.message : "Upload failed";
    setUploadError(msg);
    toast({ title: "Upload failed", description: msg, variant: "destructive" });
  };

  const handleUpload = async (type: "text" | "sheet" | "file") => {
    setUploadError(null);
    try {
      let payload: any = { hasHeader, columnIndex };
      if (type === "text") payload.rawText = rawText;
      else if (type === "sheet") payload.googleSheetUrl = googleSheetUrl;
      else if (type === "file") {
        if (!selectedFile) throw new Error("Choose a file first.");
        if (selectedFile.size > MAX_FILE_BYTES) {
          throw new Error("File is too large (max 10 MB).");
        }
        payload.csvFileBase64 = await fileToBase64(selectedFile);
        payload.csvFileName = selectedFile.name;
      }
      uploadMutation.mutate({ id: campaign.id, data: payload }, {
        onSuccess: () => {
          toast({ title: "Audience uploaded successfully" });
          queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaign.id) });
        },
        onError: (e: any) => {
          const serverMsg = e?.response?.data?.error ?? e?.message ?? "Upload failed";
          onError(new Error(serverMsg));
        },
      });
    } catch (e) {
      onError(e);
    }
  };

  const result = uploadMutation.data;

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 p-4 rounded-md flex gap-3 text-amber-800 text-sm">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <div>
          <strong className="font-semibold">PII Policy Reminder:</strong> Use Donor ID only. Do not enter names, phone numbers, email addresses, mailing addresses, or other unnecessary PII.
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 p-4 rounded-md flex gap-3 text-blue-900 text-sm">
        <Info className="h-5 w-5 shrink-0" />
        <div>
          <strong className="font-semibold">Optional step.</strong> If every touch will have its own audience list (set in the Touch Builder), you can skip this campaign-wide list entirely.
        </div>
      </div>

      {campaign.validIdCount !== undefined && campaign.validIdCount > 0 && !result && (
        <Card className="bg-blue-50/50 border-blue-100">
          <CardHeader className="py-4">
            <CardTitle className="text-lg text-blue-900 flex items-center gap-2"><Info className="h-5 w-5" /> Current Campaign-Wide Audience</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Valid IDs</p><p className="text-xl font-medium">{campaign.validIdCount?.toLocaleString()}</p></div>
              <div><p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Unique IDs</p><p className="text-xl font-medium text-primary">{campaign.uniqueIdCount?.toLocaleString()}</p></div>
              <div><p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Duplicates</p><p className="text-xl font-medium text-amber-600">{campaign.duplicateIdCount?.toLocaleString()}</p></div>
              <div><p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Rejected</p><p className="text-xl font-medium text-destructive">{campaign.rejectedIdCount?.toLocaleString()}</p></div>
            </div>
          </CardContent>
        </Card>
      )}

      {result ? (
        <Card className="border-emerald-200">
          <CardHeader className="bg-emerald-50/50">
            <CardTitle className="text-emerald-800">Upload Results</CardTitle>
            <CardDescription>Audience processed and saved.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 text-center">
              <div className="bg-gray-50 p-3 rounded"><p className="text-2xl font-semibold">{result.originalRowCount.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">Total Rows</p></div>
              <div className="bg-emerald-50 p-3 rounded"><p className="text-2xl font-semibold text-emerald-700">{result.validCount.toLocaleString()}</p><p className="text-xs text-emerald-700/70 mt-1">Valid IDs</p></div>
              <div className="bg-emerald-100 p-3 rounded"><p className="text-2xl font-semibold text-emerald-800">{result.uniqueCount.toLocaleString()}</p><p className="text-xs text-emerald-800/70 mt-1">Unique IDs</p></div>
              <div className="bg-amber-50 p-3 rounded"><p className="text-2xl font-semibold text-amber-700">{result.duplicateCount.toLocaleString()}</p><p className="text-xs text-amber-700/70 mt-1">Duplicates</p></div>
              <div className="bg-red-50 p-3 rounded"><p className="text-2xl font-semibold text-red-700">{result.rejectedCount.toLocaleString()}</p><p className="text-xs text-red-700/70 mt-1">Rejected</p></div>
            </div>

            {result.extraColumnsIgnored && (
              <div className="text-sm text-amber-600 bg-amber-50 p-2 rounded">
                Warning: Extra columns were detected and ignored to prevent PII storage.
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {result.duplicateCount > 0 && (
                <Button variant="outline" onClick={() => downloadCSV("duplicate-ids", result.duplicateSamples.map(id => ({ DonorID: id })))}>
                  <Download className="h-4 w-4 mr-2" /> Download Duplicates
                </Button>
              )}
              {result.rejectedCount > 0 && (
                <Button variant="outline" onClick={() => downloadCSV("rejected-ids", result.rejectedSamples.map(id => ({ RawInput: id })))}>
                  <Download className="h-4 w-4 mr-2" /> Download Rejected
                </Button>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t">
              <Button onClick={() => setLocation(`/campaigns/${campaign.id}/edit?step=thresholds`)}>Proceed to Thresholds</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Upload Campaign-Wide Audience</CardTitle>
            <CardDescription>Provide a list of Donor IDs for this campaign. You can skip this if every touch will use its own list.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="paste">
              <TabsList className="mb-4">
                <TabsTrigger value="paste">Paste / CSV Text</TabsTrigger>
                <TabsTrigger value="file"><Upload className="h-4 w-4 mr-1.5" /> Upload CSV</TabsTrigger>
                {settings?.googleSheetImportEnabled && (
                  <TabsTrigger value="sheet">Google Sheet URL</TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="paste" className="space-y-4">
                <Textarea
                  className="font-mono text-sm h-64"
                  placeholder="Paste Donor IDs here... (one per line or comma separated)"
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                />
                <div className="flex items-center gap-6">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="hasHeaderPaste" checked={hasHeader} onCheckedChange={(c) => setHasHeader(!!c)} />
                    <Label htmlFor="hasHeaderPaste">First row is header</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Label htmlFor="colIndexPaste">Donor ID Column Index (0-based)</Label>
                    <Input id="colIndexPaste" type="number" min="0" value={columnIndex} onChange={(e) => setColumnIndex(Number(e.target.value))} className="w-20" />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => handleUpload("text")} disabled={!rawText.trim() || uploadMutation.isPending}>
                    {uploadMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Upload & Process
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="file" className="space-y-4">
                <div
                  className={`border-2 border-dashed rounded-md p-8 text-center transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-gray-300 hover:border-primary"}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    const f = e.dataTransfer.files?.[0];
                    if (!f) return;
                    const lower = f.name.toLowerCase();
                    if (!ACCEPTED_EXT.some(ext => lower.endsWith(ext))) {
                      setUploadError(`Unsupported file type. Accepted: ${ACCEPTED_EXT.join(", ")}`);
                      return;
                    }
                    if (f.size > MAX_FILE_BYTES) {
                      setUploadError("File is too large (max 10 MB).");
                      return;
                    }
                    setSelectedFile(f);
                    setUploadError(null);
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_EXT.join(",")}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setSelectedFile(f);
                      setUploadError(null);
                    }}
                  />
                  {selectedFile ? (
                    <div className="space-y-2">
                      <FileText className="h-10 w-10 mx-auto text-primary" />
                      <p className="font-medium">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                      <Button variant="outline" size="sm" onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
                        Choose a different file
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
                      <p className="text-sm">Drop a CSV file here or click to browse</p>
                      <p className="text-xs text-muted-foreground">Accepted: .csv, .tsv, .txt — up to 10 MB</p>
                      <Button variant="outline" onClick={() => fileInputRef.current?.click()}>Choose File</Button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-6">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="hasHeaderFile" checked={hasHeader} onCheckedChange={(c) => setHasHeader(!!c)} />
                    <Label htmlFor="hasHeaderFile">First row is header</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Label htmlFor="colIndexFile">Donor ID Column Index (0-based)</Label>
                    <Input id="colIndexFile" type="number" min="0" value={columnIndex} onChange={(e) => setColumnIndex(Number(e.target.value))} className="w-20" />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => handleUpload("file")} disabled={!selectedFile || uploadMutation.isPending}>
                    {uploadMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Upload & Process
                  </Button>
                </div>
              </TabsContent>

              {settings?.googleSheetImportEnabled && (
              <TabsContent value="sheet" className="space-y-4">
                <div className="space-y-2">
                  <Label>Google Sheet URL</Label>
                  <Input
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    value={googleSheetUrl}
                    onChange={(e) => setGoogleSheetUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Sheet must be shared as <strong>"Anyone with the link &mdash; Viewer"</strong>. Include <code className="text-xs">#gid=...</code> in the URL to target a specific tab.
                  </p>
                </div>
                <div className="flex items-center gap-6">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="hasHeaderSheet" checked={hasHeader} onCheckedChange={(c) => setHasHeader(!!c)} />
                    <Label htmlFor="hasHeaderSheet">First row is header</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Label htmlFor="colIndexSheet">Donor ID Column Index (0-based)</Label>
                    <Input id="colIndexSheet" type="number" min="0" value={columnIndex} onChange={(e) => setColumnIndex(Number(e.target.value))} className="w-20" />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => handleUpload("sheet")} disabled={!googleSheetUrl.trim() || uploadMutation.isPending}>
                    {uploadMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Import & Process
                  </Button>
                </div>
              </TabsContent>
              )}
            </Tabs>

            {uploadError && (
              <div className="mt-4 text-sm text-destructive bg-red-50 border border-red-200 rounded p-3">
                {uploadError}
              </div>
            )}

            <div className="flex justify-between pt-6 mt-6 border-t">
              <Button variant="outline" onClick={() => setLocation(`/campaigns/${campaign.id}/edit?step=touches`)}>Back</Button>
              <Button variant="secondary" onClick={() => setLocation(`/campaigns/${campaign.id}/edit?step=thresholds`)}>Skip & Proceed</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
