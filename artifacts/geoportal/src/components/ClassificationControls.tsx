import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

export interface ClassificationControlsProps {
  method: string;
  setMethod: (v: string) => void;
  nClasses: number;
  setNClasses: (v: number) => void;
  minClasses?: number;
  maxClasses?: number;
  disabled?: boolean;
}

export function ClassificationControls({
  method,
  setMethod,
  nClasses,
  setNClasses,
  minClasses = 3,
  maxClasses = 10,
  disabled = false,
}: ClassificationControlsProps) {
  return (
    <div className="space-y-4 pt-2">
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-slate-500">Classification Method</Label>
        <Select value={method} onValueChange={setMethod} disabled={disabled}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="natural_breaks" className="text-xs">Natural Breaks (Jenks)</SelectItem>
            <SelectItem value="equal_interval" className="text-xs">Equal Interval</SelectItem>
            <SelectItem value="quantiles" className="text-xs">Quantiles</SelectItem>
            <SelectItem value="custom_breaks" className="text-xs">Custom Breaks</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold text-slate-500">Number of Classes</Label>
          <span className="text-xs text-muted-foreground">{nClasses}</span>
        </div>
        <Slider
          min={minClasses}
          max={maxClasses}
          step={1}
          value={[nClasses]}
          onValueChange={([v]) => setNClasses(v)}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
