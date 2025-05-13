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
    <div className="min-h-screen bg-dark-gradient from-dark-300 to-dark-500 flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background gradient circles */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-blue-500/20 blur-[100px]"></div>
        <div className="absolute top-[50%] -right-[5%] w-[30%] h-[30%] rounded-full bg-orange-500/20 blur-[100px]"></div>
      </div>
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full card backdrop-blur-sm relative z-10 overflow-hidden"
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
                <span className="absolute inset-0 bg-gradient-to-r from-blue-600 to-orange-600 group-hover:from-blue-500 group-hover:to-orange-500 transition-all duration-300"></span>
                <span className="relative flex items-center justify-center gap-2">
                  {isLoading ? 'Signing in...' : 'Sign In'}
                </span>
              </button>
            </div>
          </form>
          
          <div className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              How to get an account
            </h3>
            <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-md">
              <ol className="list-decimal list-inside text-sm text-gray-700 dark:text-gray-300 space-y-2">
                <li>Purchase a paid plan from the <Link to="/payment" className="text-indigo-600 dark:text-indigo-400 hover:underline">payment page</Link></li>
                <li>After payment confirmation, you'll receive login credentials via email</li>
                <li>This typically takes less than 24 hours</li>
                <li>Use the provided credentials to sign in</li>
              </ol>
            </div>
          </div>
          
          <div className="mt-6 text-center">
            <Link to="/" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
              Back to Home
            </Link>
          </div>
          <div className="text-center mt-8">
            <p className="text-blue-200/70 text-sm">
              Don't have an account?{' '}
              <Link to="/signup" className="text-blue-400 hover:text-blue-300 transition-colors font-medium">
                Contact us to get started
              </Link>
            </p>
          </div>
        </div>
        
        {/* Footer with logo */}
        <div className="py-4 px-6 bg-gradient-to-r from-blue-900/20 to-orange-900/20 border-t border-blue-500/20 backdrop-blur-sm">
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
      
      {/* Floating orbs for visual effect */}
      <div className="absolute top-1/4 left-1/4 w-2 h-2 rounded-full bg-blue-500 opacity-50 animate-pulse"></div>
      <div className="absolute top-3/4 left-1/3 w-3 h-3 rounded-full bg-orange-500 opacity-40 animate-pulse animation-delay-1000"></div>
      <div className="absolute top-1/2 right-1/4 w-4 h-4 rounded-full bg-blue-400 opacity-30 animate-pulse animation-delay-2000"></div>
    </div>
  );
};

export default SignInPage;
