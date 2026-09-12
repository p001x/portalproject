import { Briefcase, CheckCircle2, ChevronRight, GraduationCap, Map } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';

export function PricingPage() {
  return (
    <div className="h-full w-full overflow-y-auto bg-[#080d14] py-20 px-4 sm:px-6 lg:px-8">
      {/* Page Header */}
      <div className="text-center mb-16">
        <h1 className="text-4xl font-extrabold text-white sm:text-5xl tracking-tight">
          Geospatial Expertise <span className="text-[#0cf6bd]">On Demand</span>
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-slate-400 mx-auto">
          Choose the right level of support for your team. From 1-on-1 debugging to full enterprise pipelines.
        </p>
      </div>

      {/* Pricing Cards Grid */}
      <div className="max-w-7xl mx-auto grid gap-8 lg:grid-cols-3 lg:gap-12">
        
        {/* CARD 1: 1-on-1 Consultation */}
        <Card className="relative w-full overflow-hidden rounded-2xl border border-[#1c293e] bg-[#141d2b] p-8 shadow-xl transition-all duration-300 hover:border-[#0cf6bd]/30 hover:shadow-[#0cf6bd]/10 hover:-translate-y-1">
          <Briefcase className="absolute right-0 top-8 h-48 w-48 -translate-y-8 translate-x-12 stroke-[0.5] text-white/[0.03]" />
          <div className="relative z-10 flex flex-col h-full">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-[#0f2e2d]">
              <Briefcase className="h-7 w-7 text-[#0cf6bd]" strokeWidth={1.5} />
            </div>
            <h2 className="mb-3 text-2xl font-bold text-white tracking-tight">1-on-1 Consultation</h2>
            <p className="mb-6 text-[15px] leading-relaxed text-slate-400 min-h-[60px]">
              Personalized guidance on geospatial analysis, algorithm design, or project planning.
            </p>
            <div className="mb-8">
              <span className="text-2xl font-bold text-white">$150</span><span className="text-slate-400"> / hr</span>
            </div>
            <ul className="mb-12 flex flex-col gap-4">
              {['Live Pair-Programming & GEE Debugging', 'Geospatial Data Sourcing Strategy', 'Cloud Architecture & API Integration Review', 'Includes Written Action Plan & Estimate'].map((feature) => (
                <li key={feature} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#0cf6bd]" strokeWidth={2} />
                  <span className="text-[15px] leading-snug text-[#94a3b8]">{feature}</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-2 flex flex-col items-center">
              <a href="https://cal.com/yang-peterson-bwrflu/consultation" target="_blank" rel="noreferrer" className="w-full">
                <Button className="w-full rounded-xl bg-slate-800 py-6 text-base font-semibold text-white hover:bg-slate-700 transition-colors border border-slate-700">
                  Book Now <ChevronRight className="ml-1 h-5 w-5" strokeWidth={2.5} />
                </Button>
              </a>
              <span className="mt-3 text-xs text-slate-500 text-center leading-tight">Detailed explanation required to book.<br/>Minimum meeting cost: $10.</span>
            </div>
          </div>
        </Card>

        {/* CARD 2: Corporate Training (Highlighted) */}
        <Card className="relative w-full overflow-hidden rounded-2xl border border-[#0cf6bd] bg-[#141d2b] p-8 shadow-2xl shadow-[#0cf6bd]/10 transition-all duration-300 hover:-translate-y-1 lg:scale-105 z-10">
          {/* Highlight Badge */}
          <div className="absolute top-0 right-0 bg-[#0cf6bd] px-4 py-1 rounded-bl-xl text-teal-950 font-bold text-xs uppercase tracking-wider">
            Most Popular
          </div>
          
          <GraduationCap className="absolute right-0 top-8 h-48 w-48 -translate-y-8 translate-x-12 stroke-[0.5] text-white/[0.03]" />
          <div className="relative z-10 flex flex-col h-full">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-[#0f2e2d]">
              <GraduationCap className="h-7 w-7 text-[#0cf6bd]" strokeWidth={1.5} />
            </div>
            <h2 className="mb-3 text-2xl font-bold text-white tracking-tight">Live Team Workshops</h2>
            <p className="mb-6 text-[15px] leading-relaxed text-slate-400 min-h-[60px]">
              Comprehensive workshops for teams wanting to master Python, QGIS, and Earth Engine.
            </p>
            <div className="mb-8">
              <span className="text-2xl font-bold text-white">Custom Quote</span>
            </div>
            <ul className="mb-12 flex flex-col gap-4">
              {['Tailored curriculum for your industry', 'Hands-on exercises and real-world datasets', 'Interactive Q&A and post-training support', 'Certification of Completion'].map((feature) => (
                <li key={feature} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#0cf6bd]" strokeWidth={2} />
                  <span className="text-[15px] leading-snug text-[#94a3b8]">{feature}</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-2 flex flex-col items-center">
              <Link href="/academy" className="w-full">
                <Button className="w-full rounded-xl bg-[#0cf6bd] py-6 text-base font-semibold text-teal-950 hover:bg-[#0ae3ad] transition-colors shadow-lg shadow-[#0cf6bd]/20">
                  Access Courses <ChevronRight className="ml-1 h-5 w-5" strokeWidth={2.5} />
                </Button>
              </Link>
              <span className="mt-3 text-xs text-slate-500 font-medium">Instant access to training materials.</span>
            </div>
          </div>
        </Card>

        {/* CARD 3: Enterprise Solutions */}
        <Card className="relative w-full overflow-hidden rounded-2xl border border-[#1c293e] bg-[#141d2b] p-8 shadow-xl transition-all duration-300 hover:border-[#0cf6bd]/30 hover:shadow-[#0cf6bd]/10 hover:-translate-y-1">
          <Map className="absolute right-0 top-8 h-48 w-48 -translate-y-8 translate-x-12 stroke-[0.5] text-white/[0.03]" />
          <div className="relative z-10 flex flex-col h-full">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-[#0f2e2d]">
              <Map className="h-7 w-7 text-[#0cf6bd]" strokeWidth={1.5} />
            </div>
            <h2 className="mb-3 text-2xl font-bold text-white tracking-tight">Enterprise Solutions</h2>
            <p className="mb-6 text-[15px] leading-relaxed text-slate-400 min-h-[60px]">
              Let our experts build bespoke, AI-powered spatial models and automated data pipelines.
            </p>
            <div className="mb-8">
              <span className="text-2xl font-bold text-white">Project Based</span>
            </div>
            <ul className="mb-12 flex flex-col gap-4">
              {['Scalable ML model deployment', 'Near real-time environmental monitoring', 'High-resolution drone & satellite integration', 'Fully deployed, white-labeled Geoportals'].map((feature) => (
                <li key={feature} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#0cf6bd]" strokeWidth={2} />
                  <span className="text-[15px] leading-snug text-[#94a3b8]">{feature}</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-2 flex flex-col items-center">
              <a href="mailto:hello@blacportal.com?subject=Enterprise Solutions Request" className="w-full">
                <Button className="w-full rounded-xl bg-slate-800 py-6 text-base font-semibold text-white hover:bg-slate-700 transition-colors border border-slate-700">
                  Contact Sales <ChevronRight className="ml-1 h-5 w-5" strokeWidth={2.5} />
                </Button>
              </a>
              <span className="mt-3 text-xs text-slate-500">For projects starting at $5,000+</span>
            </div>
          </div>
        </Card>

      </div>
    </div>
  );
}
