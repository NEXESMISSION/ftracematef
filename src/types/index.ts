export type UserPlan = 'free' | 'paid';

export interface UsageLimit {
  sessionDurationSecs: number;
  sessionsPerDay: number;
}

export interface UsageStats {
  sessions: number;
  totalDuration: number;
}

export interface Testimonial {
  text: string;
  initials: string;
  avatar?: string;
  role?: string;
}

export interface FAQ {
  question: string;
  answer: string;
}

export interface OverlaySettings {
  opacity: number;
  scale: number;
  rotation: number;
  cornerTransforms: {
    topLeft: { x: number, y: number };
    topRight: { x: number, y: number };
    bottomLeft: { x: number, y: number };
    bottomRight: { x: number, y: number };
  };
}

export interface PaymentMethod {
  id: string;
  name: string;
  icon: string;
}
