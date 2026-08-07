import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Cloud, Key, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface GEEStatus {
  initialized: boolean;
  project_id: string;
  service_account: string;
}

export function GEEProjectConfig() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<GEEStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [saKey, setSaKey] = useState("");
  const { toast } = useToast();

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch("https://geoportal-api-ygzi.onrender.com/api/gee/config");
      if (res.ok) {
        const data: GEEStatus = await res.json();
        setStatus(data);
        setProjectId(data.project_id || "ee-petersonyang87");
      }
    } catch (e) {
      console.error("Failed to fetch GEE status:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleSave = async () => {
    if (!projectId.trim() && !saKey.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid GEE Cloud Project ID.",
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);
      const res = await fetch("https://geoportal-api-ygzi.onrender.com/api/gee/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId.trim() || undefined,
          service_account_key: saKey.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        toast({
          title: "GEE Re-initialized ✅",
          description: `Connected to GEE project: ${data.status.project_id}`,
        });
        setStatus(data.status);
        setOpen(false);
      } else {
        throw new Error(data.detail || "Failed to initialize GEE");
      }
    } catch (err: any) {
      toast({
        title: "GEE Initialization Failed",
        description: err.message || "Could not connect to specified GEE project.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="w-full text-left p-2.5 rounded-lg border bg-muted/40 hover:bg-muted/80 transition-colors group cursor-pointer"
          title="Configure Google Earth Engine Project"
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Cloud className="w-3.5 h-3.5 text-emerald-500" />
              <span>GEE Cloud Project</span>
            </div>
            {status?.initialized ? (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                Active
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-amber-500/10 text-amber-500 border-amber-500/20">
                Init...
              </Badge>
            )}
          </div>
          <div className="text-[11px] font-mono text-muted-foreground truncate group-hover:text-foreground">
            {loading ? "Loading..." : status?.project_id || "ee-petersonyang87"}
          </div>
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="w-5 h-5 text-emerald-500" />
            Google Earth Engine Configuration
          </DialogTitle>
          <DialogDescription>
            Configure your personal GEE Cloud Project ID to push assets directly to your own GEE account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="p-3 bg-muted/50 rounded-lg text-xs space-y-1">
            <div className="flex items-center justify-between font-medium">
              <span>Active Service Account:</span>
              <span className="font-mono text-[10px] text-muted-foreground">{status?.service_account || "Default SA"}</span>
            </div>
            <div className="flex items-center justify-between font-medium">
              <span>Active Project:</span>
              <span className="font-mono text-[10px] text-emerald-500">{status?.project_id || "ee-petersonyang87"}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gee-project-id" className="text-xs font-medium">
              GEE Cloud Project ID
            </Label>
            <Input
              id="gee-project-id"
              placeholder="e.g. ee-petersonyang87 or your-gcp-project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Asset uploads & GEE computations will write to <code className="text-xs font-mono">projects/{projectId || "YOUR_PROJECT"}/assets/</code>.
            </p>
          </div>

          <div className="space-y-1.5 pt-2 border-t">
            <Label htmlFor="gee-sa-key" className="text-xs font-medium flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-amber-500" />
              Custom Service Account JSON Key (Optional)
            </Label>
            <Textarea
              id="gee-sa-key"
              placeholder='Optional: Paste full {"type": "service_account", ...} JSON key'
              value={saKey}
              onChange={(e) => setSaKey(e.target.value)}
              rows={3}
              className="font-mono text-[10px]"
            />
            <p className="text-[11px] text-muted-foreground">
              Leave blank to keep using the default system GEE service account.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            Save & Authenticate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
