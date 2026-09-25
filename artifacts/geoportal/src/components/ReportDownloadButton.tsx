import { useState } from "react";
import { Download, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import type { AOIConfig } from "@/lib/api";

interface Props {
  moduleName: string;
  aoi: AOIConfig;
  district?: string;
  dateRange: string;
  stats: Record<string, number>;
  classAreas: Record<string, number>;
  extraNotes?: string;
  maps?: Array<[string, string]>;
  filename?: string;
  proposedFacilities?: [number, number][];
  deltaStats?: Record<string, number>;
}

/**
 * Reusable PDF report download button used by all analysis pages.
 * Calls POST /api/report and triggers a browser download.
 */
export function ReportDownloadButton({
  moduleName,
  aoi,
  district,
  dateRange,
  stats,
  classAreas,
  extraNotes,
  maps = [],
  filename,
  proposedFacilities,
  deltaStats,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agencyTemplate, setAgencyTemplate] = useState("STANDARD");

  const downloadPdf = async () => {
    setLoading(true);
    setError(null);
    try {
      const blob = await api.report({
        module_name: moduleName,
        aoi,
        district,
        date_range: dateRange,
        stats,
        class_areas: classAreas,
        extra_notes: extraNotes,
        maps,
        agency_template: agencyTemplate,
        include_action_matrix: true,
        proposed_facilities: proposedFacilities,
        delta_stats: deltaStats,
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("link");
      link.href = url;
      link.setAttribute("download", filename || `${moduleName.replace(/\s+/g, '_')}_Report.pdf`);
      
      // Simulate click
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || `${moduleName.replace(/\s+/g, '_')}_Report.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error(e);
      setError(e.message ?? "Server-side report generation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 bg-muted/40 rounded-lg p-4 border">
        <FileText className="w-8 h-8 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-sm">{moduleName} — {district}</p>
          <p className="text-xs text-muted-foreground">{dateRange}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Includes: statistics table · class area breakdown · classification maps · methodology notes
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 py-1">
        <label className="text-sm font-medium">Agency Template:</label>
        <Select value={agencyTemplate} onValueChange={setAgencyTemplate}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select Agency" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="STANDARD">Standard</SelectItem>
            <SelectItem value="REMA">REMA</SelectItem>
            <SelectItem value="MINEMA">MINEMA</SelectItem>
            <SelectItem value="RAB">RAB</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button
        onClick={downloadPdf}
        disabled={loading}
        className="w-full gap-2"
        size="lg"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        {loading ? "Generating PDF…" : "Download PDF Report"}
      </Button>

      {error && (
        <p className="text-xs text-destructive bg-destructive/10 rounded p-2">{error}</p>
      )}
    </div>
  );
}
