import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from '../services/supabaseClient';
import { Session, User } from '@supabase/supabase-js';

type UserRole = 'free' | 'paid';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  userRole: UserRole;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  checkUserRole: () => Promise<UserRole>;
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
        }
        setIsLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

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
    await supabase.auth.signOut();
    setUserRole('free');
  };

  const checkUserRole = async (): Promise<UserRole> => {
    if (!user) return 'free';

    try {
      // Log user info for debugging
      console.log('Checking role for user:', user.id, user.email);
      
      // First check if the user exists in the users table
      const { data, error } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('Error fetching user role from database:', error);
        
        // If the user is authenticated but not in the database yet,
        // treat them as a paid user by default
        console.log('User authenticated but not found in database, setting as paid user');
        const defaultRole: UserRole = 'paid';
        setUserRole(defaultRole);
        return defaultRole;
      }

      const role = data?.role as UserRole || 'paid';
      console.log('User role detected:', role);
      setUserRole(role);
      return role;
    } catch (error) {
      console.error('Error checking user role:', error);
      // Default to paid for authenticated users with errors
      const defaultRole: UserRole = 'paid';
      setUserRole(defaultRole);
      return defaultRole;
    }
  };

  const value = {
    session,
    user,
    userRole,
    isLoading,
    signIn,
    signOut,
    checkUserRole,
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
