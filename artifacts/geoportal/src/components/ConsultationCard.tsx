import { Briefcase, CheckCircle2, ChevronRight } from 'lucide-react';
import { Card } from './ui/card';
import { Button } from './ui/button';

export function ConsultationCard() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0d131f] p-8">
      <Card className="relative w-full max-w-[380px] overflow-hidden rounded-2xl border border-[#1c293e] bg-[#141d2b] p-8 shadow-xl">
        {/* Background Briefcase Watermark */}
        <Briefcase className="absolute right-0 top-8 h-48 w-48 -translate-y-8 translate-x-12 stroke-[0.5] text-white/[0.03]" />

        <div className="relative z-10 flex flex-col h-full">
          {/* Icon */}
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-[#0f2e2d]">
            <Briefcase className="h-7 w-7 text-[#0cf6bd]" strokeWidth={1.5} />
          </div>

          {/* Header */}
          <h2 className="mb-3 text-2xl font-bold text-white tracking-tight">1-on-1 Consultation</h2>
          <p className="mb-6 text-[15px] leading-relaxed text-slate-400">
            Personalized guidance on geospatial analysis, algorithm design, or project planning.
          </p>

          {/* Price */}
          <div className="mb-8">
            <span className="text-2xl font-bold text-white">$150 / hr</span>
          </div>

          {/* Features */}
          <ul className="mb-12 flex flex-col gap-4">
            <li className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#0cf6bd]" strokeWidth={2} />
              <span className="text-[15px] leading-snug text-[#94a3b8]">Live Pair-Programming & GEE Debugging</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#0cf6bd]" strokeWidth={2} />
              <span className="text-[15px] leading-snug text-[#94a3b8]">Geospatial Data Sourcing Strategy</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#0cf6bd]" strokeWidth={2} />
              <span className="text-[15px] leading-snug text-[#94a3b8]">Cloud Architecture & API Integration Review</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#0cf6bd]" strokeWidth={2} />
              <span className="text-[15px] leading-snug text-[#94a3b8]">Includes Written Action Plan & Estimate</span>
            </li>
          </ul>

          {/* Button */}
          <div className="mt-auto pt-2">
            <Button className="w-full rounded-xl bg-[#0cf6bd] py-6 text-base font-semibold text-teal-950 hover:bg-[#0ae3ad] transition-colors">
              Book Now
              <ChevronRight className="ml-1 h-5 w-5" strokeWidth={2.5} />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
