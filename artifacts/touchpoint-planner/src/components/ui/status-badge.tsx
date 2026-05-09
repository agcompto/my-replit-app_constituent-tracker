import { Badge } from "@/components/ui/badge";
import { Circle, UploadCloud, Eye, CheckCircle2, Send, Archive, Ban } from "lucide-react";

export function StatusBadge({ status }: { status: string }) {
  const normStatus = status.toLowerCase();
  
  if (normStatus === "draft") {
    return <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200"><Circle className="w-3 h-3 mr-1" /> Draft</Badge>;
  }
  if (normStatus === "uploaded") {
    return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200"><UploadCloud className="w-3 h-3 mr-1" /> Uploaded</Badge>;
  }
  if (normStatus === "previewed") {
    return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200"><Eye className="w-3 h-3 mr-1" /> Previewed</Badge>;
  }
  if (normStatus === "finalized") {
    return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200"><CheckCircle2 className="w-3 h-3 mr-1" /> Finalized</Badge>;
  }
  if (normStatus === "exported" || normStatus === "exported / sent") {
    return <Badge variant="default" className="bg-primary text-primary-foreground"><Send className="w-3 h-3 mr-1" /> Exported / Sent</Badge>;
  }
  if (normStatus === "archived") {
    return <Badge variant="secondary" className="bg-gray-100 text-gray-600"><Archive className="w-3 h-3 mr-1" /> Archived</Badge>;
  }
  if (normStatus === "voided") {
    return <Badge variant="destructive" className="bg-red-50 text-red-700 border-red-200"><Ban className="w-3 h-3 mr-1" /> Voided</Badge>;
  }
  
  return <Badge variant="outline">{status}</Badge>;
}
