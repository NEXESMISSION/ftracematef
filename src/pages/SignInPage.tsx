import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { usePayment } from '../contexts/PaymentContext';
import { isOnline, isSupabaseReachable } from '../utils/networkStatus';
import { SUPABASE_URL } from '../config/supabase';
import NetworkStatusIndicator from '../components/NetworkStatusIndicator';

const SignInPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [networkStatus, setNetworkStatus] = useState<{ online: boolean; supabaseReachable: boolean | null }>({ 
    online: true, 
    supabaseReachable: null 
  });

  const { signIn, session, isLoading: authIsLoading, userRole, user } = useAuth();
  const { isPaymentFlow, selectedPlan } = usePayment();
  const navigate = useNavigate();
  const location = useLocation();

  // Check network status on component mount
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
    
    // Set up event listeners for online/offline status
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

  useEffect(() => {
    if (!authIsLoading && session) {
      if (isPaymentFlow && selectedPlan) {
        // User just signed in and has a selected plan, redirect back to payment page
        navigate('/payment');
      } else {
        // Check if user has active subscription, if not redirect to payment
        const checkSubscriptionAndRedirect = async () => {
          try {
            console.log('Checking subscription status for user:', user?.email);
            console.log('Current user role:', userRole);
            
            if (userRole === 'paid') {
              // User has active subscription, go to app
              console.log('User has paid subscription, redirecting to app');
              navigate('/app');
            } else {
              // User doesn't have active subscription, redirect to payment
              console.log('User has no active subscription, redirecting to payment');
              navigate('/payment');
            }
          } catch (error) {
            console.error('Error checking subscription:', error);
            // Default to payment page if there's an error
            navigate('/payment');
          }
        };
        checkSubscriptionAndRedirect();
      }
    }
  }, [session, authIsLoading, navigate, isPaymentFlow, selectedPlan, userRole, user]);

  // Check for success message from account creation
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const message = searchParams.get('message');
    const userEmail = searchParams.get('email');
    
    if (message === 'account_created' && userEmail) {
      setSuccessMessage(`Account created successfully! Please check your email (${userEmail}) for a verification link. You can sign in after verifying your email.`);
      setEmail(userEmail);
      // Clear the URL parameters
      navigate('/signin', { replace: true });
    }
  }, [location, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    // Check network status before attempting to sign in
    if (!networkStatus.online) {
      setError('You are currently offline. Please check your internet connection.');
      return;
    }
    
    if (networkStatus.supabaseReachable === false) {
      setError('Unable to reach the authentication server. Please check your Supabase configuration or try again later.');
      return;
    }
    e.preventDefault();
    
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const { error } = await signIn(email, password);
      
      if (error) {
        throw new Error(error.message);
      }
      
      // Navigation will be handled by the useEffect above
    } catch (err: any) {
      console.error('Sign in error:', err);
      
      // Provide more specific error messages
      if (err.message?.includes('fetch') || err.message?.includes('network')) {
        setError('Network error: Failed to connect to the server. Please check your internet connection and Supabase configuration in .env file.');
      } else if (err.message?.includes('Invalid login')) {
        setError('Invalid email or password. Please try again.');
      } else if (err.message?.includes('Email not confirmed') || err.message?.includes('email not confirmed')) {
        setError('Your email has not been confirmed. Please check your inbox for a verification email and click the verification link before signing in.');
      } else if (err.message?.includes('Email not verified') || err.message?.includes('email not verified')) {
        setError('Please verify your email address first. Check your inbox for a verification email from TraceMate.');
      } else {
        setError(err.message || 'Failed to sign in');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-dark-400 to-dark-600 text-white font-sans text-selectable">
      {/* Navigation Bar */}
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

      {/* Mobile Menu */}
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
      
      {/* Main Content with padding for the fixed header */}
      <div className="pt-20 min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
        {/* Background gradient circles */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
          <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-blue-500/20 blur-[100px]"></div>
          <div className="absolute top-[50%] -right-[5%] w-[30%] h-[30%] rounded-full bg-orange-500/20 blur-[100px]"></div>
        </div>
        
        <div className="flex flex-col md:flex-row gap-6 max-w-5xl w-full relative z-10">
          {/* Sign In Form */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex-1 bg-dark-400/30 border border-primary-500/20 rounded-xl backdrop-blur-sm overflow-hidden"
          >
            <div className="py-8 px-6 md:px-10">
              <NetworkStatusIndicator 
                online={networkStatus.online} 
                supabaseReachable={networkStatus.supabaseReachable} 
              />
              <div className="text-center mb-10">
                <img src="/assests/logo/logo-dark-bg.png" alt="TraceMate Logo" className="h-16 mx-auto mb-4" />
                <h2 className="text-4xl font-bold text-white mb-4">Sign In</h2>
                <p className="mt-2 text-sm text-blue-200/80">
                  {isPaymentFlow && selectedPlan 
                    ? `Complete your ${selectedPlan} plan purchase`
                    : 'Enter your credentials to access your account'
                  }
                </p>
              </div>
              
              {error && (
                <div className="mb-6 p-3 bg-red-900/40 border border-red-500/50 text-red-200 rounded-lg backdrop-blur-sm">
                  {error}
                </div>
              )}
              
              {successMessage && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-6 p-4 bg-green-900/40 border border-green-500/50 text-green-200 rounded-lg backdrop-blur-sm"
                >
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="font-medium mb-1">Account Created Successfully!</p>
                      <p className="text-sm text-green-300">{successMessage}</p>
                      <p className="text-xs text-green-400 mt-2">
                        💡 <strong>Tip:</strong> Check your spam folder if you don't see the email in your inbox.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
              
              <form onSubmit={handleSubmit}>
                <div className="mb-6">
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
                
                <div className="mb-8">
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
                
                <div className="mb-8">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className={`w-full flex justify-center py-3 px-4 rounded-lg text-white font-medium relative overflow-hidden group ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                  >
                    <span className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 transition-all duration-300"></span>
                    <span className="relative flex items-center justify-center gap-2">
                      {isLoading ? 'Signing in...' : (isPaymentFlow ? 'Continue to Payment' : 'Sign In')}
                    </span>
                  </button>
                </div>
                
                <div className="py-2 flex items-center gap-4 mb-6">
                  <div className="flex-grow h-px bg-primary-500/20"></div>
                  <span className="text-sm text-primary-300/50">or</span>
                  <div className="flex-grow h-px bg-primary-500/20"></div>
                </div>
                
                <div className="mb-6">
                  <Link
                    to="/create-account"
                    className="w-full flex justify-center py-3 px-4 rounded-lg text-white font-medium relative overflow-hidden group"
                  >
                    <span className="absolute inset-0 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-500 hover:to-blue-500 transition-all duration-300"></span>
                    <span className="relative flex items-center justify-center gap-2">
                      Create an account
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </span>
                  </Link>
                </div>
              </form>
              
              <div className="mt-6 text-center">
                <p className="mt-4">
                  <Link to="/" className="text-gray-400 hover:text-white">
                    Back to Home
                  </Link>
                </p>
              </div>
            </div>
            
            {/* Footer with logo */}
            <div className="py-4 px-6 bg-dark-400/30 border-t border-primary-500/20 backdrop-blur-sm">
              <div className="flex justify-between items-center">
                <div className="text-xs text-blue-200/60">
                  &copy; {new Date().getFullYear()} TraceMate
                </div>
                <div className="flex space-x-4">
                  <Link to="/privacy" className="text-xs text-blue-200/60 hover:text-blue-200/90 transition-colors">
                    Privacy Policy
                  </Link>
                  <Link to="/terms" className="text-xs text-blue-200/60 hover:text-blue-200/90 transition-colors">
                    Terms of Service
                  </Link>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
        
        {/* Floating orbs for visual effect */}
        <div className="absolute top-1/4 left-1/4 w-2 h-2 rounded-full bg-blue-500 opacity-50 animate-pulse"></div>
        <div className="absolute top-3/4 left-1/3 w-3 h-3 rounded-full bg-orange-500 opacity-40 animate-pulse animation-delay-1000"></div>
        <div className="absolute top-1/2 right-1/4 w-4 h-4 rounded-full bg-blue-400 opacity-30 animate-pulse animation-delay-2000"></div>
      </div>
    </div>
  );
};

export default SignInPage;
