import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Briefcase, CheckCircle2, ChevronRight, GraduationCap, Map, MessageSquare } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';

export function PricingPage() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedService, setSelectedService] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const requestMutation = useMutation({
    mutationFn: () => api.services.requestService({
      service_type: selectedService,
      message: message
    }),
    onSuccess: () => {
      setSubmitted(true);
      toast({
        title: "Request Sent!",
        description: "We have received your booking request and will be in touch shortly.",
      });
      setTimeout(() => {
        setIsDialogOpen(false);
        setSubmitted(false);
        setMessage("");
      }, 3000);
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: "Submission Failed",
        description: err.message || "Something went wrong. Please try again.",
      });
    }
  });

  const handleBookClick = (serviceType: string) => {
    setSelectedService(serviceType);
    setIsDialogOpen(true);
    setSubmitted(false);
    setMessage("");
  };

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
              <Button
                onClick={() => handleBookClick("1-on-1 Consultation")}
                className="w-full rounded-xl bg-slate-800 py-6 text-base font-semibold text-white hover:bg-slate-700 transition-colors border border-slate-700 cursor-pointer"
              >
                Request Consultation <ChevronRight className="ml-1 h-5 w-5" strokeWidth={2.5} />
              </Button>
              <span className="mt-3 text-xs text-slate-500 text-center leading-tight">Direct advisory session scheduled upon request.</span>
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
                  Access Studies & Books <ChevronRight className="ml-1 h-5 w-5" strokeWidth={2.5} />
                </Button>
              </Link>
              <span className="mt-3 text-xs text-slate-500 font-medium">Instant access to training materials and videos.</span>
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
              <Button
                onClick={() => handleBookClick("Enterprise Solutions")}
                className="w-full rounded-xl bg-slate-800 py-6 text-base font-semibold text-white hover:bg-slate-700 transition-colors border border-slate-700 cursor-pointer"
              >
                Contact Sales <ChevronRight className="ml-1 h-5 w-5" strokeWidth={2.5} />
              </Button>
              <span className="mt-3 text-xs text-slate-500">Custom scopes and multi-year engagements.</span>
            </div>
          </div>
        </Card>

      </div>

      {/* Booking Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px] bg-[#141d2b] border-[#1c293e] text-white">
          <DialogHeader>
            <DialogTitle className="text-2xl flex items-center gap-2 text-white">
              <MessageSquare className="w-6 h-6 text-[#0cf6bd]" />
              Book {selectedService}
            </DialogTitle>
            <DialogDescription className="text-base pt-2 text-slate-400">
              Tell us a bit about your project or learning goals. We will follow up via email to schedule your session and discuss pricing.
            </DialogDescription>
          </DialogHeader>
          
          {!submitted ? (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Your Message / Requirements</label>
                <Textarea 
                  placeholder="e.g. I need help migrating my QGIS workflow to a scalable Google Earth Engine script..."
                  className="min-h-[150px] resize-none bg-[#0d131f] border-[#1c293e] text-white placeholder:text-slate-500 focus:border-[#0cf6bd] focus:ring-[#0cf6bd]/20"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>
              <Button 
                className="w-full bg-[#0cf6bd] text-teal-950 font-semibold hover:bg-[#0ae3ad] transition-colors py-5" 
                onClick={() => requestMutation.mutate()}
                disabled={requestMutation.isPending || !message.trim()}
              >
                {requestMutation.isPending ? "Sending..." : "Submit Request"}
              </Button>
            </div>
          ) : (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-16 h-16 bg-[#0cf6bd]/10 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-[#0cf6bd]" />
              </div>
              <h3 className="text-xl font-bold text-white">Request Received!</h3>
              <p className="text-slate-400 text-sm">We'll be in touch with you shortly.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
