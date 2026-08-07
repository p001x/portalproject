import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';

const getSessionId = () => {
  let sessionId = sessionStorage.getItem('analytics_session_id');
  if (!sessionId) {
    sessionId = typeof crypto.randomUUID === 'function' 
        ? crypto.randomUUID() 
        : Math.random().toString(36).substring(2, 15);
    sessionStorage.setItem('analytics_session_id', sessionId);
  }
  return sessionId;
};

const getModuleName = (path: string) => {
  const base = path.split('?')[0].replace(/\/$/, "");
  
  if (base === '' || base === '/ndvi') return 'ndvi';
  if (base === '/lst') return 'lst';
  if (base === '/rusle') return 'rusle';
  if (base === '/slope') return 'slope';
  if (base === '/landfill') return 'landfill';
  if (base === '/air') return 'air';
  if (base === '/landslide') return 'landslide';
  if (base === '/flood') return 'flood';
  if (base === '/drought') return 'drought';
  if (base === '/uhi') return 'uhi';
  if (base === '/rare-data') return 'rare_data';
  if (base === '/samples') return 'samples';
  return 'unknown';
};

export function useAnalytics() {
  const [location] = useLocation();
  const lastTrackedPath = useRef<string | null>(null);

  const trackEvent = async (event_type: string, module_name?: string, customPath?: string) => {
    const currentPath = customPath || location || '/';
    const module = module_name || getModuleName(currentPath);
    
    try {
      await fetch("https://geoportal-api-ygzi.onrender.com/api/analytics/event", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event_type,
          module,
          path: currentPath,
          session_id: getSessionId(),
        }),
      });
    } catch (error) {
      console.error('Analytics tracking failed:', error);
    }
  };

  useEffect(() => {
    // Only track if the path actually changed to prevent double-firing on re-renders
    if (lastTrackedPath.current !== location) {
      lastTrackedPath.current = location;
      trackEvent('page_view');
    }
  }, [location]);

  return { trackEvent };
}

// A simple invisible component to drop into your App.tsx to automatically track all page views
export function AnalyticsTracker() {
  useAnalytics();
  return null;
}
