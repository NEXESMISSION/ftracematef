import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { usePayment } from '../contexts/PaymentContext';
import { mockPaymentProcess, STRIPE_PLANS } from '../services/stripeService';
import { supabase } from '../services/supabaseClient';
import UsageTest from '../components/UsageTest';

const PaymentPage: React.FC = () => {
  const { user, signOut, refreshUserRole } = useAuth();
  const { selectedPlan, setSelectedPlan, isPaymentFlow, setIsPaymentFlow, clearSelectedPlan } = usePayment();
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Handle plan selection and redirect to auth if needed
  const handlePlanSelection = (plan: 'monthly' | 'lifetime') => {
    setSelectedPlan(plan);
    setIsPaymentFlow(true);
    
    if (!user) {
      // User is not logged in, redirect to sign-in
      navigate('/signin');
    } else {
      // User is logged in, proceed to Stripe payment
      handleStripePayment(plan);
    }
  };

  // Handle Stripe payment
  const handleStripePayment = async (plan: 'monthly' | 'lifetime') => {
    if (!user?.email) {
      setPaymentError('User email not found');
      return;
    }

    setIsProcessing(true);
    setPaymentError(null);

    try {
      console.log('Starting payment process for plan:', plan);
      
      // For now, use mock payment process
      // TODO: Replace with actual Stripe integration
      const result = await mockPaymentProcess(plan, user.email);
      
      if (result.success) {
        console.log('Mock payment successful, updating subscription...');
        
        // Payment successful - update user subscription in database
        const subscriptionData = {
          user_id: user.id,
          plan_id: plan,
          plan_name: STRIPE_PLANS[plan].name,
          status: 'active',
          current_period_start: new Date().toISOString(),
          current_period_end: plan === 'lifetime' ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days for monthly
          stripe_payment_intent_id: `mock_${Date.now()}`,
          amount: STRIPE_PLANS[plan].price,
          currency: STRIPE_PLANS[plan].currency
        };

        console.log('Inserting subscription data:', subscriptionData);
        
        const { error: subscriptionError } = await supabase
          .from('user_subscriptions')
          .insert(subscriptionData);

        if (subscriptionError) {
          console.error('Error saving subscription:', subscriptionError);
          setPaymentError('Payment successful but failed to update subscription. Please contact support.');
          return;
        }

        console.log('Subscription saved successfully, updating user role...');

        // Also update the user's role directly in the users table
        const { error: userUpdateError } = await supabase
          .from('users')
          .update({ role: 'paid' })
          .eq('id', user.id);

        if (userUpdateError) {
          console.error('Error updating user role:', userUpdateError);
          // Don't return here, continue with refresh
        }

        // Refresh user role to reflect new subscription
        console.log('Refreshing user role...');
        await refreshUserRole();
        
        // Wait a moment for the role to update
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('Payment process completed successfully');
        
        // Payment successful
        alert(`Payment successful! You now have ${STRIPE_PLANS[plan].name} access.`);
        
        // Clear payment flow and redirect to app
        clearSelectedPlan();
        navigate('/app');
      } else {
        console.error('Payment failed:', result.error);
        setPaymentError(result.error || 'Payment failed');
      }
    } catch (error) {
      console.error('Payment error:', error);
      setPaymentError('Payment failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Check if user just completed authentication and should proceed to payment
  useEffect(() => {
    if (user && isPaymentFlow && selectedPlan && !isProcessing) {
      // User just logged in and has a selected plan, proceed to payment
      handleStripePayment(selectedPlan);
    }
  }, [user, isPaymentFlow, selectedPlan, isProcessing]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-dark-400 to-dark-600 text-white font-sans relative overflow-hidden">
      {/* Background gradient circles */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-blue-500/20 blur-[100px]"></div>
        <div className="absolute top-[50%] -right-[5%] w-[30%] h-[30%] rounded-full bg-orange-500/20 blur-[100px]"></div>
      </div>
      
      {/* Navigation Bar */}
      <nav className="fixed top-0 left-0 w-full z-50 bg-dark-500/80 backdrop-blur-md border-b border-primary-500/20">
        <div className="container mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <Link to="/">
                <img 
                  src="/assests/logo/logo-dark-bg.png" 
                  alt="TraceMate Logo" 
                  className="h-10" 
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    if (target.src !== '/assets/logo/logo-dark-bg.png') {
                      target.src = '/assets/logo/logo-dark-bg.png';
                    }
                  }}
                />
              </Link>
            </div>
            
            <div className="hidden md:flex items-center">
              <div className="flex space-x-10">
                <Link to="/" className="text-white hover:text-blue-300 transition-colors font-medium">
                  Home
                </Link>
                <Link to="/app" className="text-white hover:text-blue-300 transition-colors font-medium">
                  App
                </Link>
                {/* Only show Pricing link if user is not signed in */}
                {!user && (
                  <Link to="/payment" className="text-white hover:text-blue-300 transition-colors font-medium">
                    Pricing
                  </Link>
                )}
              </div>
              
              {user && (
                <button
                  onClick={signOut}
                  className="ml-8 px-4 py-1.5 bg-red-600/80 hover:bg-red-700 text-white rounded-lg transition-colors duration-300 text-sm font-medium"
                >
                  Sign Out
                </button>
              )}
            </div>
            
            <button 
              className="md:hidden text-white p-2 rounded-lg bg-dark-400/50 border border-blue-500/20"
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
            className="text-white hover:text-blue-300 transition-colors font-medium py-3 px-4 rounded-lg bg-dark-400/30 border border-blue-500/10 text-center text-lg"
            onClick={() => document.getElementById('mobileMenu')?.classList.add('hidden')}
          >
            Home
          </Link>
          <Link 
            to="/app" 
            className="text-white hover:text-blue-300 transition-colors font-medium py-3 px-4 rounded-lg bg-dark-400/30 border border-blue-500/10 text-center text-lg"
            onClick={() => document.getElementById('mobileMenu')?.classList.add('hidden')}
          >
            App
          </Link>
          <Link 
            to="/payment" 
            className="text-white hover:text-blue-300 transition-colors font-medium py-3 px-4 rounded-lg bg-dark-400/30 border border-blue-500/10 text-center text-lg"
            onClick={() => document.getElementById('mobileMenu')?.classList.add('hidden')}
          >
            Pricing
          </Link>
          {user && (
            <button
              onClick={signOut}
              className="text-white bg-red-600/80 hover:bg-red-700 py-3 px-4 rounded-lg text-center text-lg mt-6 w-full"
            >
              Sign Out
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="pt-24 pb-16 px-4 container mx-auto max-w-6xl relative z-10">
        {/* Payment Processing Overlay */}
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center"
          >
            <div className="bg-dark-400/90 border border-primary-500/30 rounded-xl p-8 max-w-md mx-4 text-center">
              <div className="animate-spin w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              <h3 className="text-xl font-bold text-white mb-2">Processing Payment</h3>
              <p className="text-primary-200/80">Please wait while we process your payment...</p>
            </div>
          </motion.div>
        )}

        {/* Payment Error Display */}
        {paymentError && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-red-900/40 border border-red-500/50 text-red-200 rounded-lg backdrop-blur-sm"
          >
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <span className="font-medium">Payment Error:</span> {paymentError}
                <button
                  onClick={() => setPaymentError(null)}
                  className="ml-2 text-red-300 hover:text-red-100 underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Pricing Section */}
        <div className="py-20 relative overflow-hidden">
          <div className="absolute -top-[10%] right-[10%] w-[40%] h-[40%] rounded-full bg-primary-500/10 blur-[100px]"></div>
          <div className="absolute -bottom-[10%] left-[10%] w-[30%] h-[30%] rounded-full bg-primary-500/10 blur-[100px]"></div>
          
          <div className="container mx-auto px-4 relative z-10">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center mb-16"
            >
              <h2 className="text-4xl font-bold font-heading mb-4 text-white">
                Simple, Transparent Pricing
              </h2>
              <p className="text-xl text-primary-200 max-w-3xl mx-auto font-light">
                Choose the plan that works best for you
              </p>
            </motion.div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {/* Free Plan */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="bg-dark-300/50 backdrop-blur-sm border border-primary-500/20 rounded-xl overflow-hidden shadow-lg hover:shadow-primary-500/10 transition-all duration-300 flex flex-col h-full"
              >
                <div className="p-8 border-b border-primary-500/20 text-center">
                  <h3 className="text-2xl font-bold text-white font-heading mb-2">Free Plan</h3>
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-4xl font-bold text-white">$0</span>
                    <span className="text-primary-200/70 font-light">/forever</span>
                  </div>
                  <p className="mt-4 text-primary-200/80 font-light">Perfect for casual users and beginners</p>
                </div>
                
                <div className="p-8 flex-grow">
                  <ul className="space-y-4">
                    <li className="flex items-start gap-3">
                      <svg className="w-6 h-6 text-primary-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-white">2-minute sessions</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <svg className="w-6 h-6 text-primary-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-white">3 sessions per day</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <svg className="w-6 h-6 text-primary-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-white">Basic image adjustments</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <svg className="w-6 h-6 text-primary-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-white">No account required</span>
                    </li>
                  </ul>
                </div>
                
                <div className="p-8 pt-0">
                  <button 
                    onClick={() => window.location.href = '/app'}
                    className="w-full py-3 px-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-medium rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center gap-2"
                  >
                    <span>Try For Free</span>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </button>
                </div>
              </motion.div>
              
              {/* Monthly Plan */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="bg-dark-300/50 backdrop-blur-sm border border-primary-500/40 rounded-xl overflow-hidden shadow-lg hover:shadow-primary-500/20 transition-all duration-300 flex flex-col h-full relative"
              >
                <div className="absolute top-0 right-0 bg-gradient-to-r from-primary-600 to-primary-500 text-white text-sm font-medium py-1 px-4 rounded-bl-lg">
                  Popular
                </div>
                
                <div className="p-8 border-b border-primary-500/20 text-center">
                  <h3 className="text-2xl font-bold text-white font-heading mb-2">Monthly Plan</h3>
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-4xl font-bold text-white">$6</span>
                    <span className="text-primary-200/70 font-light">/month</span>
                  </div>
                  <p className="mt-4 text-primary-200/80 font-light">For artists who want unlimited access</p>
                </div>
                
                <div className="p-8 flex-grow">
                  <ul className="space-y-4">
                    <li className="flex items-start gap-3">
                      <svg className="w-6 h-6 text-primary-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-white">Unlimited session duration</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <svg className="w-6 h-6 text-primary-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-white">Unlimited sessions</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <svg className="w-6 h-6 text-primary-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-white">Advanced image controls</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <svg className="w-6 h-6 text-primary-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-white">Simple one-click tracing</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <svg className="w-6 h-6 text-primary-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-white">Priority support</span>
                    </li>
                  </ul>
                </div>
                
                <div className="p-8 pt-0">
                  <button 
                    onClick={() => handlePlanSelection('monthly')}
                    className="w-full py-3 px-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-medium rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center gap-2"
                  >
                    <span>Get Monthly</span>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </button>
                </div>
              </motion.div>

              {/* Lifetime Plan */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="bg-dark-300/50 backdrop-blur-sm border border-primary-500/40 rounded-xl overflow-hidden shadow-lg hover:shadow-primary-500/20 transition-all duration-300 flex flex-col h-full relative"
              >
                <div className="absolute top-0 right-0 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-medium py-1 px-4 rounded-bl-lg">
                  Best Value
                </div>
                
                <div className="p-8 border-b border-primary-500/20 text-center">
                  <h3 className="text-2xl font-bold text-white font-heading mb-2">Lifetime Access</h3>
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-4xl font-bold text-white">$15</span>
                    <span className="text-primary-200/70 font-light">/once</span>
                  </div>
                  <p className="mt-4 text-primary-200/80 font-light">Pay once, use forever</p>
                </div>
                
                <div className="p-8 flex-grow">
                  <ul className="space-y-4">
                    <li className="flex items-start gap-3">
                      <svg className="w-6 h-6 text-primary-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-white">Everything in Monthly plan</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <svg className="w-6 h-6 text-primary-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-white">Never pay again</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <svg className="w-6 h-6 text-primary-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-white">All premium features included</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <svg className="w-6 h-6 text-primary-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-white">Premium support</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <svg className="w-6 h-6 text-primary-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-white">Early access to new features</span>
                    </li>
                  </ul>
                </div>
                
                <div className="p-8 pt-0">
                  <button 
                    onClick={() => handlePlanSelection('lifetime')}
                    className="w-full py-3 px-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-medium rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center gap-2"
                  >
                    <span>Get Lifetime Access</span>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </button>
                </div>
              </motion.div>
            </div>
            
            <div className="mt-12 text-center">
              <p className="text-primary-200/70 max-w-2xl mx-auto font-light">
                All plans include access to basic tracing features. Premium users get unlimited usage and advanced controls for the best experience.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Debug Panel */}
      <UsageTest />
    </div>
  );
};

export default PaymentPage;
