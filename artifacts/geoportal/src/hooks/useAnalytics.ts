import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { BASE, api } from '@/lib/api';

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

export const getFriendlyModuleName = (path: string): string => {
  const base = path.split('?')[0].replace(/\/$/, "");
  
  if (base === '' || base === '/') return 'Home Platform';
  if (base === '/ndvi') return 'NDVI Analysis';
  if (base === '/lst') return 'LST Mono-Window';
  if (base === '/rusle') return 'Soil Erosion (RUSLE)';
  if (base === '/slope') return 'Slope Analysis';
  if (base === '/landfill') return 'Landfill Suitability';
  if (base === '/air') return 'Air Quality Monitor';
  if (base === '/landslide') return 'Landslide Hazard';
  if (base === '/flood') return 'Flood Mapping';
  if (base === '/drought') return 'Drought Assessment';
  if (base === '/uhi') return 'Urban Heat Island';
  if (base === '/rare-data') return 'Rare Data Repository';
  if (base === '/samples') return 'Sample Digitization';
  if (base === '/community') return 'Community Forum';
  if (base === '/biomass') return 'Biomass & Carbon';
  if (base === '/water-harvesting') return 'Water Harvesting';
  if (base === '/wellscope') return 'WellScope Exploration';
  if (base === '/earthwork') return 'Earthwork Cut & Fill';
  if (base === '/accessibility') return 'Accessibility Analysis';
  if (base === '/habitat') return 'Habitat Suitability';
  if (base === '/admin/users') return 'User Management';
  if (base === '/dashboard') return 'Traffic Analytics';
  if (base === '/settings') return 'User Settings';
  return 'Platform Explorer';
};

export function useAnalytics() {
  const [location] = useLocation();
  const lastTrackedPath = useRef<string | null>(null);

  const getUserEmail = (): string | undefined => {
    const token = localStorage.getItem("spetro_token");
    if (!token) return undefined;
    try {
      const parts = token.split('.');
      if (parts.length >= 2) {
        const payload = JSON.parse(atob(parts[1]));
        return payload?.sub || payload?.email;
      }
    } catch {
      // ignore parsing error
    }
    return undefined;
  };

  const trackEvent = async (event_type: string, module_name?: string, customPath?: string, details?: string) => {
    const currentPath = customPath || location || '/';
    const module = module_name || getFriendlyModuleName(currentPath);
    const userEmail = getUserEmail();
    
    // 1. Send anonymous or authenticated telemetry event
    try {
      fetch(`${BASE}/analytics/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type,
          module,
          path: currentPath,
          session_id: getSessionId(),
          user_email: userEmail,
        }),
      }).catch(() => {});
    } catch {
      // ignore
    }

    // 2. If logged in, log authenticated user activity
    const token = localStorage.getItem("spetro_token");
    if (token) {
      try {
        api.activity.log(event_type, module, details || `Viewed ${module}`, userEmail).catch(() => {});
      } catch {
        // ignore
      }
    }
  };

  useEffect(() => {
    // Only track if the path actually changed to prevent double-firing on re-renders
    if (lastTrackedPath.current !== location) {
      lastTrackedPath.current = location;
      const friendlyModule = getFriendlyModuleName(location);
      trackEvent('view_page', friendlyModule, location, `Visited ${friendlyModule} (${location})`);
    }
  }, [location]);

  return { trackEvent };
}

// Global helper to trigger activity logs from any button or analysis run
export const logUserAction = (action: string, module: string, details?: string) => {
  const token = localStorage.getItem("spetro_token");
  if (token) {
    let email: string | undefined = undefined;
    try {
      const parts = token.split('.');
      if (parts.length >= 2) {
        const payload = JSON.parse(atob(parts[1]));
        email = payload?.sub || payload?.email;
      }
    } catch {}
    api.activity.log(action, module, details, email).catch(() => {});
  }
};

// A simple invisible component to drop into your App.tsx to automatically track all page views
export function AnalyticsTracker() {
  useAnalytics();
  return null;
}
