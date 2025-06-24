import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabaseClient';
import { isOnline, isSupabaseReachable } from '../utils/networkStatus';
import { SUPABASE_URL } from '../config/supabase';
import NetworkStatusIndicator from '../components/NetworkStatusIndicator';

const CreateAccountPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [formIsLoading, setFormIsLoading] = useState(false);
  const [networkStatus, setNetworkStatus] = useState<{ online: boolean; supabaseReachable: boolean | null }>({ 
    online: true, 
    supabaseReachable: null 
  });

  const { signUp, session, isLoading: authIsLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authIsLoading && session) {
      console.log('User signed up successfully, redirecting to payment');
      // User just created account, redirect to payment page
      navigate('/payment');
    }
  }, [session, authIsLoading, navigate]);

  useEffect(() => {
    const checkNetworkStatus = async () => {
      const online = isOnline();
      let supabaseReachable = null;
      
      if (online) {
        supabaseReachable = await isSupabaseReachable(SUPABASE_URL);
      }
      
      setNetworkStatus({ online, supabaseReachable });
    };
    
    checkNetworkStatus();
    
    const handleOnline = () => {
      setNetworkStatus(prev => ({ ...prev, online: true }));
      isSupabaseReachable(SUPABASE_URL).then(reachable => 
        setNetworkStatus(prev => ({ ...prev, supabaseReachable: reachable }))
      );
    };
    
    const handleOffline = () => {
      setNetworkStatus({ online: false, supabaseReachable: false });
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    if (!networkStatus.online) {
      setError('You are currently offline. Please check your internet connection.');
      return;
    }
    
    if (networkStatus.supabaseReachable === false) {
      setError('Unable to reach the authentication server. Please check your Supabase configuration or try again later.');
      return;
    }
    e.preventDefault();
    
    if (!email || !password || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    setFormIsLoading(true);
    setError(null);
    
    try {
      const { error } = await signUp(email, password);
      
      if (error) {
        throw new Error(error.message);
      }
      
      // Redirect to sign-in page with success message about email verification
      navigate('/signin?message=account_created&email=' + encodeURIComponent(email));
    } catch (err: any) {
      console.error('Sign up error:', err);
      setError(err.message || 'Failed to create an account');
    } finally {
      setFormIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-dark-400 to-dark-600 text-white font-sans text-selectable">
      <nav className="fixed top-0 left-0 w-full z-50 bg-dark-500/80 backdrop-blur-md border-b border-primary-500/20">
        <div className="container mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <Link to="/" className="text-white text-xl font-bold flex items-center">
              <img src="/assests/logo/logo-dark-bg.png" alt="TraceMate Logo" className="h-10" />
            </Link>
            
            <div className="hidden md:flex items-center">
              <div className="flex space-x-10">
                <Link to="/" className="text-white hover:text-primary-100 transition-colors font-medium">
                  Home
                </Link>
                <Link to="/app" className="text-white hover:text-primary-100 transition-colors font-medium">
                  App
                </Link>
                <Link to="/payment" className="text-white hover:text-primary-100 transition-colors font-medium">
                  Pricing
                </Link>
              </div>
            </div>
            
            <button 
              className="md:hidden text-white p-2 rounded-lg bg-dark-400/50 border border-primary-500/20"
              onClick={() => {
                const menu = document.getElementById('mobileMenu');
                if (menu) {
                  menu.classList.toggle('hidden');
                  menu.classList.toggle('flex');
                }
              }}
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </nav>

      <div 
        id="mobileMenu" 
        className="hidden fixed top-0 left-0 right-0 bottom-0 flex-col bg-dark-500/95 backdrop-blur-md p-6 z-[100] overflow-y-auto"
      >
        <div className="flex justify-end mb-4">
          <button 
            onClick={() => document.getElementById('mobileMenu')?.classList.add('hidden')}
            className="text-white p-2 rounded-full bg-dark-400/70 hover:bg-dark-300/70 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex flex-col space-y-6 py-4 mt-10">
          <Link 
            to="/"
            className="text-white hover:text-primary-100 transition-colors font-medium py-3 px-4 rounded-lg bg-dark-400/30 border border-primary-500/10 text-center text-lg"
            onClick={() => document.getElementById('mobileMenu')?.classList.add('hidden')}
          >
            Home
          </Link>
          <Link 
            to="/app" 
            className="text-white hover:text-primary-100 transition-colors font-medium py-3 px-4 rounded-lg bg-dark-400/30 border border-primary-500/10 text-center text-lg"
            onClick={() => document.getElementById('mobileMenu')?.classList.add('hidden')}
          >
            App
          </Link>
          <Link 
            to="/payment" 
            className="text-white hover:text-primary-100 transition-colors font-medium py-3 px-4 rounded-lg bg-dark-400/30 border border-primary-500/10 text-center text-lg"
            onClick={() => document.getElementById('mobileMenu')?.classList.add('hidden')}
          >
            Pricing
          </Link>
        </div>
      </div>
      
      <div className="pt-20 min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
          <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-blue-500/20 blur-[100px]"></div>
          <div className="absolute top-[50%] -right-[5%] w-[30%] h-[30%] rounded-full bg-orange-500/20 blur-[100px]"></div>
        </div>
        
        <div className="flex flex-col md:flex-row gap-6 max-w-5xl w-full relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex-1 bg-dark-400/30 border border-primary-500/20 rounded-xl backdrop-blur-sm overflow-hidden"
          >
            <div className="p-8 md:p-12">
              <h2 className="text-4xl font-bold text-white mb-4">Create Account</h2>
              <p className="text-gray-300 mb-8">Join TraceMate and start tracking your data.</p>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-500/20 border border-red-500 text-red-200 p-4 rounded-lg mb-6 text-center"
                >
                  {error}
                </motion.div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-blue-100 mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 py-3 bg-dark-400/50 border border-blue-500/30 rounded-lg shadow-inner text-white placeholder-blue-300/50 focus:outline-none focus:border-blue-400/70 focus:ring-1 focus:ring-blue-400/70 backdrop-blur-sm"
                      placeholder="you@example.com"
                      required
                    />
                    <div className="absolute inset-0 rounded-lg pointer-events-none border border-blue-500/10 border-t-blue-500/30 border-l-blue-500/30"></div>
                  </div>
                </div>
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-blue-100 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 bg-dark-400/50 border border-blue-500/30 rounded-lg shadow-inner text-white placeholder-blue-300/50 focus:outline-none focus:border-blue-400/70 focus:ring-1 focus:ring-blue-400/70 backdrop-blur-sm"
                      placeholder="••••••••"
                      required
                    />
                    <div className="absolute inset-0 rounded-lg pointer-events-none border border-blue-500/10 border-t-blue-500/30 border-l-blue-500/30"></div>
                  </div>
                </div>
                <div>
                  <label htmlFor="confirm-password" className="block text-sm font-medium text-blue-100 mb-2">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-4 py-3 bg-dark-400/50 border border-blue-500/30 rounded-lg shadow-inner text-white placeholder-blue-300/50 focus:outline-none focus:border-blue-400/70 focus:ring-1 focus:ring-blue-400/70 backdrop-blur-sm"
                      placeholder="••••••••"
                      required
                    />
                    <div className="absolute inset-0 rounded-lg pointer-events-none border border-blue-500/10 border-t-blue-500/30 border-l-blue-500/30"></div>
                  </div>
                </div>
                <button 
                  type="submit" 
                  disabled={formIsLoading || !networkStatus.online || networkStatus.supabaseReachable === false}
                  className={`w-full flex justify-center py-3 px-4 rounded-lg text-white font-medium relative overflow-hidden group ${formIsLoading || !networkStatus.online || networkStatus.supabaseReachable === false ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 transition-all duration-300"></span>
                  <span className="relative flex items-center justify-center gap-2">
                    {formIsLoading ? (
                      <>
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Creating Account...
                      </>
                    ) : (
                      <>
                        Create Account
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </>
                    )}
                  </span>
                </button>
              </form>

              <div className="mt-8 text-center">
                <p className="text-gray-400">
                  Already have an account?{' '}
                  <Link to="/signin" className="font-medium text-primary-400 hover:text-primary-300">
                    Sign In
                  </Link>
                </p>
              </div>
              <div className="mt-4">
                <NetworkStatusIndicator online={networkStatus.online} supabaseReachable={networkStatus.supabaseReachable} />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default CreateAccountPage;
