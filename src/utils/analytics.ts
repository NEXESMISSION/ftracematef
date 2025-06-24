// Google Analytics setup for SEO and user tracking
export const GA_TRACKING_ID = 'G-XXXXXXXXXX'; // Replace with your actual GA4 tracking ID

// Initialize Google Analytics
export const initGA = () => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('config', GA_TRACKING_ID, {
      page_title: document.title,
      page_location: window.location.href,
    });
  }
};

// Track page views
export const trackPageView = (url: string) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('config', GA_TRACKING_ID, {
      page_path: url,
    });
  }
};

// Track custom events
export const trackEvent = (action: string, category: string, label?: string, value?: number) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', action, {
      event_category: category,
      event_label: label,
      value: value,
    });
  }
};

// Track user engagement
export const trackUserEngagement = (action: string) => {
  trackEvent(action, 'user_engagement');
};

// Track payment events
export const trackPaymentEvent = (plan: string, amount: number) => {
  trackEvent('purchase', 'ecommerce', plan, amount);
};

// Track app usage
export const trackAppUsage = (feature: string) => {
  trackEvent('app_usage', 'feature_usage', feature);
};

// Declare gtag for TypeScript
declare global {
  interface Window {
    gtag: (...args: any[]) => void;
  }
} 