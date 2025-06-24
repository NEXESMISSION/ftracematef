import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from '../services/supabaseClient';
import { Session, User } from '@supabase/supabase-js';
import { getUserSubscriptionStatus } from '../services/supabaseClient';

type UserRole = 'free' | 'paid';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  userRole: UserRole;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  checkUserRole: () => Promise<UserRole>;
  refreshUserRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<UserRole>('free');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        checkUserRole().then(setUserRole);
      }
      setIsLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          checkUserRole().then(setUserRole);
        } else {
          setUserRole('free');
        }
        setIsLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

    const signUp = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signUp({ 
        email, 
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/signin`
        }
      });
      return { error };
    } catch (e: any) {
      console.error('Network error during sign up:', e);
      return { 
        error: {
          message: e.message || 'Network error. Please check your internet connection and Supabase configuration.'
        } 
      };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error };
    } catch (e: any) {
      console.error('Network error during sign in:', e);
      return { 
        error: {
          message: e.message || 'Network error. Please check your internet connection and Supabase configuration.'
        } 
      };
    }
  };

  const signOut = async () => {
    try {
      // Try to sign out using Supabase
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      
      if (error) {
        console.error('Error signing out:', error);
        // If there's an error, we'll still clear the local state
      }
    } catch (err) {
      console.error('Exception during sign out:', err);
      // If there's an exception, we'll still clear the local state
    } finally {
      // Always clear local state regardless of server response
      setSession(null);
      setUser(null);
      setUserRole('free');
      
      // Manually clear all Supabase-related items from localStorage
      try {
        // Get all keys from localStorage
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          // Remove any keys related to Supabase auth
          if (key && key.includes('supabase.auth')) {
            localStorage.removeItem(key);
          }
        }
        
        // Force state update
        const event = new Event('visibilitychange');
        document.dispatchEvent(event);
      } catch (e) {
        console.error('Error clearing localStorage:', e);
      }
    }
  };

  const checkUserRole = async (): Promise<UserRole> => {
    if (!user) return 'free';

    try {
      // Log user info for debugging
      console.log('Checking role for user:', user.id, user.email);
      
      // First check if the user has an active subscription
      const subscriptionStatus = await getUserSubscriptionStatus(user.id);
      console.log('Subscription status:', subscriptionStatus);
      
      if (subscriptionStatus === 'active') {
        console.log('User has active subscription, setting as paid');
        setUserRole('paid');
        return 'paid';
      }
      
      // If no active subscription, check the user's role in the users table
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      if (userError) {
        console.error('Error fetching user role from database:', userError);
        // Default to free for authenticated users with errors
        const defaultRole: UserRole = 'free';
        setUserRole(defaultRole);
        return defaultRole;
      }

      const role = userData?.role as UserRole || 'free';
      console.log('User role from database:', role);
      setUserRole(role);
      return role;
    } catch (error) {
      console.error('Error checking user role:', error);
      // Default to free for authenticated users with errors
      const defaultRole: UserRole = 'free';
      setUserRole(defaultRole);
      return defaultRole;
    }
  };

  const refreshUserRole = async () => {
    if (user) {
      console.log('Refreshing user role for user:', user.id);
      const newRole = await checkUserRole();
      console.log('New role detected:', newRole);
      setUserRole(newRole);
      
      // Force a re-render by updating the session
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setSession(session);
      }
    }
  };

  const value = {
    session,
    user,
    userRole,
    isLoading,
    signIn,
    signUp,
    signOut,
    checkUserRole,
    refreshUserRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
