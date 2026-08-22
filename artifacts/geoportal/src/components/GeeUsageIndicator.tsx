import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export function GeeUsageIndicator() {
  const [usage, setUsage] = useState<{ used: number; limit: number | string } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUsage = () => {
    let mounted = true;
    api.auth.getGeeUsage()
      .then((data) => {
        if (mounted) {
          setUsage(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to load GEE usage", err);
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  };

  useEffect(() => {
    const cleanup = fetchUsage();
    
    const handleUpdate = () => {
      fetchUsage();
    };
    
    window.addEventListener("gee-usage-update", handleUpdate);
    return () => {
      cleanup();
      window.removeEventListener("gee-usage-update", handleUpdate);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 mt-2 px-1">
        <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground">Loading usage...</span>
      </div>
    );
  }

  if (!usage) return null;

  if (usage.limit === "Unlimited" || true) {
    return (
      <div className="mt-2 px-1">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
          <span>GEE Usage</span>
          <span className="font-medium text-emerald-500">Unlimited</span>
        </div>
      </div>
    );
  }

  const limitNum = typeof usage.limit === 'number' ? usage.limit : 15;
  const usedNum = usage.used;
  const percentage = Math.min((usedNum / limitNum) * 100, 100);
  
  let progressColor = "bg-primary";
  if (percentage > 80) progressColor = "bg-destructive";
  else if (percentage > 50) progressColor = "bg-amber-500";

  return (
    <div className="mt-2 px-1 group cursor-help" title="Daily limit for generating maps. Resets at midnight UTC.">
      <div className="flex items-center justify-between text-[10px] mb-1">
        <span className="text-muted-foreground">GEE Map Usage</span>
        <span className={`font-medium ${percentage >= 100 ? "text-destructive" : "text-foreground"}`}>
          {usedNum} / {limitNum}
        </span>
      </div>
      <Progress value={percentage} className="h-1.5" indicatorClassName={progressColor} />
    </div>
  );
}
