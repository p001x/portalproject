import React, { useState, useEffect } from "react";
import { ArrowLeft, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatePresence, motion } from "framer-motion";

interface StorySection {
  id: string;
  title: string;
  text: string;
  mediaType: "image" | "video" | "chart" | "none";
  mediaUrl: string;
}

export function StoryMapViewer({ 
  article, 
  onBack 
}: { 
  article: any, 
  onBack: () => void 
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  
  let sections: StorySection[] = [];
  try {
    const parsed = JSON.parse(article.content);
    sections = parsed.sections || [];
  } catch(e) {}

  // Set up intersection observers for each section
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = Number(entry.target.getAttribute("data-index"));
            setActiveIdx(idx);
          }
        });
      },
      { rootMargin: "-40% 0px -40% 0px" } // Triggers when section crosses the middle of the screen
    );

    const elements = document.querySelectorAll(".story-section");
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [sections]);

  const activeSection = sections[activeIdx];

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950 overflow-hidden flex font-sans">
      {/* Background Media */}
      <div className="absolute inset-0 z-0 bg-slate-900">
        <AnimatePresence mode="popLayout">
          {activeSection && activeSection.mediaType !== "none" && (
            <motion.div
              key={activeSection.id}
              initial={{ opacity: 0, scale: 1.05 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.2, ease: "easeInOut" }}
              className="absolute inset-0"
            >
              {activeSection.mediaType === "video" ? (
                <video 
                  src={activeSection.mediaUrl} 
                  autoPlay muted loop playsInline 
                  className="w-full h-full object-cover opacity-60 mix-blend-luminosity" 
                />
              ) : (
                <img 
                  src={activeSection.mediaUrl} 
                  className="w-full h-full object-cover opacity-60 mix-blend-luminosity" 
                  alt=""
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Subtle gradient overlay to ensure text is always readable */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
      </div>

      {/* Foreground Scroll Container */}
      <div className="relative z-10 w-full h-full overflow-y-auto overflow-x-hidden scroll-smooth">
        
        {/* Back Button */}
        <div className="sticky top-6 left-6 z-50 inline-block">
          <Button variant="secondary" onClick={onBack} className="rounded-full shadow-2xl gap-2 bg-white/10 hover:bg-white/20 text-white border-white/20 backdrop-blur-md">
            <ArrowLeft className="w-4 h-4" /> Back to Blog
          </Button>
        </div>

        {/* Title Screen */}
        <div className="min-h-screen flex flex-col justify-center px-8 md:px-24">
          <div className="max-w-4xl text-left">
            <motion.h1 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.8 }}
              className="text-5xl md:text-8xl font-black text-white mb-6 drop-shadow-2xl leading-[1.1]"
            >
              {article.title}
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.8 }}
              className="text-xl md:text-3xl text-white/90 max-w-2xl font-light drop-shadow-lg"
            >
              {article.excerpt}
            </motion.p>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1, duration: 1 }}
              className="mt-16 animate-bounce text-white/70 flex items-center gap-3"
            >
              <ArrowDown className="w-6 h-6" />
              <span className="text-sm uppercase tracking-[0.3em] font-semibold">Scroll to explore</span>
            </motion.div>
          </div>
        </div>

        {/* Sections */}
        <div className="pb-[70vh]">
          {sections.map((section, idx) => (
            <div 
              key={section.id} 
              data-index={idx}
              className="story-section min-h-[90vh] flex items-center px-6 md:px-24 py-24"
            >
              <div className="w-full max-w-xl">
                <motion.div 
                  initial={{ opacity: 0, x: -50 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ margin: "-20% 0px -20% 0px" }}
                  transition={{ duration: 0.6 }}
                  className="bg-black/40 backdrop-blur-2xl p-8 md:p-12 rounded-3xl shadow-2xl border border-white/10"
                >
                  {section.title && (
                    <h2 className="text-3xl md:text-4xl font-bold mb-6 text-white leading-tight">
                      {section.title}
                    </h2>
                  )}
                  {section.text && (
                    <div className="text-lg text-white/90 leading-relaxed whitespace-pre-wrap font-light">
                      {section.text}
                    </div>
                  )}
                </motion.div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
