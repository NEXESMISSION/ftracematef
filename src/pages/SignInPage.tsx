import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';

const SignInPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
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
      
      // Redirect to app on successful login
      navigate('/app');
    } catch (err: any) {
      setError(err.message || 'Failed to sign in');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-dark-400 to-dark-600 text-white font-sans">
      {/* Navigation Bar */}
      <nav className="fixed top-0 left-0 w-full z-50 bg-dark-500/80 backdrop-blur-md border-b border-primary-500/20">
        <div className="container mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <img src="/assests/logo/logo-dark-bg.png" alt="TraceMate Logo" className="h-10 mr-3" />
            </div>
            
            <div className="hidden md:flex items-center">
              <div className="flex space-x-10">
                <Link to="/" className="text-white hover:text-primary-100 transition-colors font-medium">
                  Home
                </Link>
                <Link to="/tracing" className="text-white hover:text-primary-100 transition-colors font-medium">
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
            to="/tracing" 
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
              <div className="text-center mb-10">
                <img src="/assests/logo/logo-dark-bg.png" alt="TraceMate Logo" className="h-16 mx-auto mb-4" />
                <h1 className="text-3xl font-bold gradient-text">Sign In to TraceMate</h1>
                <p className="mt-2 text-sm text-blue-200/80">
                  Enter your credentials to access your account
                </p>
              </div>
              
              {error && (
                <div className="mb-6 p-3 bg-red-900/40 border border-red-500/50 text-red-200 rounded-lg backdrop-blur-sm">
                  {error}
                </div>
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
                
                <div className="mb-6">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className={`w-full flex justify-center py-3 px-4 rounded-lg text-white font-medium relative overflow-hidden group ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                  >
                    <span className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 transition-all duration-300"></span>
                    <span className="relative flex items-center justify-center gap-2">
                      {isLoading ? 'Signing in...' : 'Sign In'}
                    </span>
                  </button>
                </div>
              </form>
              
              <div className="mt-6 text-center md:hidden">
                <Link 
                  to="/" 
                  className="inline-block py-2 px-6 rounded-lg text-white font-medium relative overflow-hidden group"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-blue-600/70 to-purple-600/70 hover:from-blue-500/70 hover:to-purple-500/70 transition-all duration-300"></span>
                  <span className="relative flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Back to Home
                  </span>
                </Link>
              </div>
              
              <div className="text-center mt-8">
                <p className="text-blue-200/70 text-sm">
                  Don't have an account?{' '}
                  <Link to="/payment" className="text-blue-400 hover:text-blue-300 transition-colors font-medium">
                    Get started now
                  </Link>
                </p>
              </div>
              
              {/* Mobile version of How to get an account - Only visible on mobile */}
              <div className="mt-8 border-t border-primary-500/20 pt-6 block md:hidden">
                <h3 className="text-lg font-medium text-white mb-4">
                  How to get an account
                </h3>
                <div className="bg-dark-400/30 p-4 rounded-md border border-primary-500/20">
                  <ol className="list-decimal list-inside text-sm text-blue-200/80 space-y-2">
                    <li>Purchase a paid plan from the <Link to="/payment" className="text-blue-400 hover:text-blue-300 transition-colors">payment page</Link></li>
                    <li>After payment confirmation, you'll receive login credentials via email</li>
                    <li>This typically takes less than 24 hours</li>
                    <li>Use the provided credentials to sign in</li>
                  </ol>
                </div>
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
          
          {/* How to get an account - Desktop version */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="hidden md:flex flex-col w-80 bg-dark-400/30 border border-primary-500/20 rounded-xl backdrop-blur-sm overflow-hidden self-start"
          >
            <div className="p-6">
              <h3 className="text-xl font-bold text-white mb-6 border-b border-primary-500/20 pb-3">
                How to get an account
              </h3>
              
              <ol className="list-none text-sm text-blue-200/80 space-y-6">
                <li className="flex items-start">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center mr-3 mt-0.5">
                    <span className="text-blue-400 font-bold">1</span>
                  </div>
                  <div>
                    <p className="font-medium text-white mb-1">Purchase a plan</p>
                    <p>Visit our <Link to="/payment" className="text-blue-400 hover:text-blue-300 transition-colors">payment page</Link> and select a subscription</p>
                  </div>
                </li>
                
                <li className="flex items-start">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center mr-3 mt-0.5">
                    <span className="text-blue-400 font-bold">2</span>
                  </div>
                  <div>
                    <p className="font-medium text-white mb-1">Confirmation email</p>
                    <p>You'll receive your login credentials via email</p>
                  </div>
                </li>
                
                <li className="flex items-start">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center mr-3 mt-0.5">
                    <span className="text-blue-400 font-bold">3</span>
                  </div>
                  <div>
                    <p className="font-medium text-white mb-1">Processing time</p>
                    <p>This typically takes less than 24 hours</p>
                  </div>
                </li>
                
                <li className="flex items-start">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center mr-3 mt-0.5">
                    <span className="text-blue-400 font-bold">4</span>
                  </div>
                  <div>
                    <p className="font-medium text-white mb-1">Sign in</p>
                    <p>Use the provided credentials to access your account</p>
                  </div>
                </li>
              </ol>
              
              <div className="mt-10 space-y-4">
                <Link 
                  to="/" 
                  className="block w-full py-3 px-4 rounded-lg text-white font-medium relative overflow-hidden group text-center"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-blue-600/70 to-purple-600/70 hover:from-blue-500/70 hover:to-purple-500/70 transition-all duration-300"></span>
                  <span className="relative flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Back to Home
                  </span>
                </Link>
                
                <Link 
                  to="/payment" 
                  className="block w-full py-3 px-4 rounded-lg text-white font-medium relative overflow-hidden group text-center"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 transition-all duration-300"></span>
                  <span className="relative flex items-center justify-center gap-2">
                    Get Your Account
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </span>
                </Link>
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
