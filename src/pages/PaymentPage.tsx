import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { PaymentMethod } from '../types';

// Payment methods supported
const paymentMethods: PaymentMethod[] = [
  { id: 'visa', name: 'Visa', icon: 'credit-card' },
  { id: 'mastercard', name: 'MasterCard', icon: 'credit-card' },
  { id: 'binance', name: 'Binance', icon: 'bitcoin' },
  { id: 'coinbase', name: 'Coinbase', icon: 'bitcoin' },
  { id: 'redotpay', name: 'RedotPay', icon: 'credit-card' },
];

const PaymentPage: React.FC = () => {
  // Function to open WhatsApp with prefilled message
  const handleWhatsAppPayment = () => {
    const message = encodeURIComponent(
      "Hello! I'd like to upgrade to the paid plan for TraceMate. Please guide me through the payment process."
    );
    const whatsappUrl = `https://wa.me/1234567890?text=${message}`;
    window.open(whatsappUrl, '_blank');
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
        className="max-w-lg w-full card backdrop-blur-sm relative z-10 overflow-hidden"
      >
        <div className="py-8 px-6 md:px-10">
          <div className="text-center mb-10">
            <img src="/assests/logo/logo-dark-bg.png" alt="TraceMate Logo" className="h-16 mx-auto mb-4" />
            <h1 className="text-3xl font-bold gradient-text">Upgrade to Unlimited</h1>
            <p className="mt-2 text-sm text-blue-200/80">
              One-time payment of $9.99 for unlimited tracing
            </p>
          </div>
          
          <div className="mb-8">
            <div className="bg-blue-900/20 p-6 rounded-lg border border-blue-500/20 backdrop-blur-sm">
              <h2 className="text-xl font-semibold gradient-text-subtle mb-4">
                Why Choose Manual Payment?
              </h2>
              <ul className="space-y-4 text-blue-100/90">
                <li className="flex items-start">
                  <div className="flex-shrink-0 h-6 w-6 rounded-full bg-gradient-to-r from-blue-500 to-orange-500 flex items-center justify-center mr-3 mt-0.5">
                    <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span>No hidden fees or subscription charges</span>
                </li>
                <li className="flex items-start">
                  <div className="flex-shrink-0 h-6 w-6 rounded-full bg-gradient-to-r from-blue-500 to-orange-500 flex items-center justify-center mr-3 mt-0.5">
                    <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span>Direct support from our team via WhatsApp/RedotPay</span>
                </li>
                <li className="flex items-start">
                  <div className="flex-shrink-0 h-6 w-6 rounded-full bg-gradient-to-r from-blue-500 to-orange-500 flex items-center justify-center mr-3 mt-0.5">
                    <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span>Multiple payment options including crypto</span>
                </li>
                <li className="flex items-start">
                  <div className="flex-shrink-0 h-6 w-6 rounded-full bg-gradient-to-r from-blue-500 to-orange-500 flex items-center justify-center mr-3 mt-0.5">
                    <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span>Lifetime access with one-time payment</span>
                </li>
              </ul>
            </div>
          </div>
          
          <div className="mb-8">
            <h3 className="text-lg font-medium gradient-text-subtle mb-4 text-center">
              Payment Methods Accepted
            </h3>
            <div className="flex flex-wrap justify-center gap-4">
              {paymentMethods.map((method) => (
                <div 
                  key={method.id}
                  className="flex flex-col items-center p-3 bg-blue-900/20 backdrop-blur-sm border border-blue-500/20 rounded-lg w-24 hover:bg-blue-800/30 transition-colors duration-300"
                >
                  <div className="w-10 h-10 flex items-center justify-center bg-gradient-to-r from-blue-500 to-orange-500 rounded-full mb-2 shadow-glow">
                    <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                  </div>
                  <span className="text-sm text-blue-100">{method.name}</span>
                </div>
              ))}
            </div>
          </div>
          
          <div className="mb-8">
            <h3 className="text-lg font-medium gradient-text-subtle mb-4 text-center">
              How It Works
            </h3>
            <div className="bg-blue-900/20 backdrop-blur-sm border border-blue-500/20 p-6 rounded-lg">
              <ol className="space-y-4 text-blue-100/90">
                {[
                  "Click the \"Pay via WhatsApp\" button below",
                  "Send us a message with your payment preference",
                  "Our team will guide you through the payment process",
                  "Once payment is confirmed, we'll create your account",
                  "You'll receive login credentials via email within 24 hours"
                ].map((step, index) => (
                  <li key={index} className="flex items-start">
                    <div className="flex-shrink-0 h-6 w-6 rounded-full bg-gradient-to-r from-blue-500 to-orange-500 flex items-center justify-center mr-3 mt-0.5 text-white text-xs font-bold">
                      {index + 1}
                    </div>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
          
          <div className="mb-6">
            <button
              onClick={handleWhatsAppPayment}
              className="w-full flex justify-center items-center py-3 px-4 rounded-lg text-white font-medium relative overflow-hidden group"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-green-600 to-green-500 group-hover:from-green-500 group-hover:to-green-400 transition-all duration-300"></span>
              <span className="relative flex items-center justify-center gap-2">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Pay via WhatsApp
              </span>
            </button>
          </div>
          
          <div className="mb-6">
            <button
              onClick={() => window.open('https://redotpay.com', '_blank')}
              className="w-full flex justify-center items-center py-3 px-4 rounded-lg text-white font-medium relative overflow-hidden group"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-blue-600 to-orange-600 group-hover:from-blue-500 group-hover:to-orange-500 transition-all duration-300"></span>
              <span className="relative flex items-center justify-center gap-2">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                Pay via RedotPay
              </span>
            </button>
          </div>
          
          <div className="mt-8 text-center">
            <Link to="/" className="text-blue-400 hover:text-blue-300 transition-colors font-medium flex items-center justify-center gap-2">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Home
            </Link>
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

export default PaymentPage;
