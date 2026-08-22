import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { GraduationCap, Briefcase, Map, CheckCircle2, ChevronRight, MessageSquare } from "lucide-react";
import { useLocation } from "wouter";

const SERVICES = [
  {
    id: "consultation",
    title: "1-on-1 Consultation",
    icon: Briefcase,
    description: "Personalized guidance on geospatial analysis, algorithm design, or project planning.",
    price: "$150 / hr",
    features: [
      "Custom GEE Script Debugging",
      "Architecture Review for scalable pipelines",
      "Live pair-programming sessions",
      "Feasibility assessments for your project",
    ]
  },
  {
    id: "teaching",
    title: "Corporate Training & Teaching",
    icon: GraduationCap,
    description: "Comprehensive workshops for teams wanting to master Python, QGIS, and Earth Engine.",
    price: "Custom Quote",
    features: [
      "Tailored curriculum for your industry",
      "Hands-on exercises and real-world datasets",
      "Interactive Q&A and post-training support",
      "Certification of Completion",
    ]
  },
  {
    id: "custom_analysis",
    title: "Ultra GIS Engineering",
    icon: Map,
    description: "Let our experts build bespoke, AI-powered spatial models and automated data pipelines tailored to your organization.",
    price: "Project Based",
    features: [
      "Custom Machine Learning model training on multi-petabyte satellite data",
      "Real-time automated environmental monitoring pipelines & API access",
      "Sub-meter resolution drone & satellite imagery fusion",
      "Fully deployed, white-labeled bespoke web Geoportals",
    ]
  }
];

export function ServicesPage() {
  const { toast } = useToast();
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [, setLocation] = useLocation();

  const requestMutation = useMutation({
    mutationFn: () => api.services.requestService({
      service_type: selectedService || "unknown",
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
        description: err.message || "Something went wrong.",
      });
    }
  });

  const handleBookClick = (serviceId: string) => {
    if (serviceId === "teaching") {
      setLocation("/academy");
      return;
    }
    setSelectedService(serviceId);
    setIsDialogOpen(true);
  };

  const selectedServiceDetails = SERVICES.find(s => s.id === selectedService);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto py-12 px-6 lg:px-8">
        <div className="text-center mb-16 max-w-3xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-6 bg-gradient-to-r from-emerald-400 to-blue-500 bg-clip-text text-transparent">
          Expert Geospatial Services
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed">
          Unlock the full potential of spatial data with our premium consultation, corporate teaching, and bespoke analysis packages. Let us accelerate your geospatial journey.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {SERVICES.map((service) => {
          const Icon = service.icon;
          return (
            <div key={service.id} className="relative group rounded-2xl border bg-card p-8 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col h-full hover:border-emerald-500/50">
              <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                <Icon className="w-24 h-24" />
              </div>
              <div className="mb-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-2xl font-bold mb-2">{service.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed h-16">{service.description}</p>
              </div>
              
              <div className="text-xl font-semibold mb-6 text-foreground/90">
                {service.price}
              </div>

              <div className="flex-1">
                <ul className="space-y-3 mb-8">
                  {service.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start text-sm text-muted-foreground">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 mr-2 mt-0.5 shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <Button 
                className="w-full group/btn" 
                size="lg"
                onClick={() => handleBookClick(service.id)}
              >
                {service.id === "teaching" ? "View Courses" : "Book Now"}
                <ChevronRight className="w-4 h-4 ml-1 group-hover/btn:translate-x-1 transition-transform" />
              </Button>
            </div>
          )
        })}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-2xl flex items-center gap-2">
              <MessageSquare className="w-6 h-6 text-primary" />
              Book {selectedServiceDetails?.title}
            </DialogTitle>
            <DialogDescription className="text-base pt-2">
              Tell us a bit about your project or learning goals. We will follow up via email to schedule your session and discuss pricing.
            </DialogDescription>
          </DialogHeader>
          
          {!submitted ? (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Your Message / Requirements</label>
                <Textarea 
                  placeholder="e.g. I need help migrating my QGIS workflow to a scalable Google Earth Engine script..."
                  className="min-h-[150px] resize-none"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>
              <Button 
                className="w-full" 
                onClick={() => requestMutation.mutate()}
                disabled={requestMutation.isPending || !message.trim()}
              >
                {requestMutation.isPending ? "Sending..." : "Submit Request"}
              </Button>
            </div>
          ) : (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              <h3 className="text-xl font-bold">Request Received!</h3>
              <p className="text-muted-foreground text-sm">We'll be in touch with you shortly.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </div>
  );
}
