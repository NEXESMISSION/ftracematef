import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

// Define simplified pricing plans
type PricingPlan = {
  id: string;
  name: string;
  price: string;
  period: string;
  description?: string;
  highlight?: boolean;
};

const pricingPlans: PricingPlan[] = [
  {
    id: 'monthly',
    name: 'Monthly 📅',
    price: '6',
    period: 'month',
    highlight: true
  },
  {
    id: 'lifetime',
    name: 'Lifetime ♾️',
    price: '15',
    period: 'once'
  }
];

// Define payment methods with proper image paths
type PaymentMethod = {
  id: string;
  name: string;
  icon: string;
};

const paymentMethods: PaymentMethod[] = [
  { id: 'visa', name: 'Visa', icon: '/assets/payment methods icons/Visa_Logo.png' },
  { id: 'mastercard', name: 'MasterCard', icon: '/assets/payment methods icons/Mastercard-logo.svg' },
  { id: 'binance', name: 'Binance', icon: '/assets/payment methods icons/Binance_Logo.png' },
  { id: 'coinbase', name: 'Coinbase', icon: '/assets/payment methods icons/coinbase.png' },
  { id: 'bitcoin', name: 'Bitcoin', icon: '/assets/payment methods icons/Bitcoin.svg' },
  { id: 'wise', name: 'Wise', icon: '/assets/payment methods icons/wise.png' },
  { id: 'kraken', name: 'Kraken', icon: '/assets/payment methods icons/kraken.png' },
];

const PaymentPage: React.FC = () => {
  // Function to open WhatsApp with prefilled message
  const handleWhatsAppContact = () => {
    const message = encodeURIComponent(
      "Hello! I'd like to upgrade to the paid plan for TraceMate. Please guide me through the payment process."
    );
    const whatsappUrl = `https://wa.me/1234567890?text=${message}`;
    window.open(whatsappUrl, '_blank');
  };

  // Function to open Instagram
  const handleInstagramContact = () => {
    window.open('https://instagram.com/tracemate', '_blank');
  };

  // Function to open Telegram
  const handleTelegramContact = () => {
    window.open('https://t.me/tracemate', '_blank');
  };

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
                <img src="/assets/logo/logo-dark-bg.png" alt="TraceMate Logo" className="h-10" />
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
                <Link to="/payment" className="text-white hover:text-blue-300 transition-colors font-medium">
                  Pricing
                </Link>
              </div>
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
        </div>
      </div>

      {/* Main Content */}
      <div className="pt-24 pb-16 px-4 container mx-auto max-w-6xl relative z-10">
        {/* Page Title */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12 bg-dark-400/30 backdrop-blur-sm border border-primary-500/20 rounded-xl p-6 md:p-8 max-w-3xl mx-auto"
        >
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">Payment Options</span> <span className="text-white">💳</span>
          </h1>
          <p className="text-xl text-blue-100/80 max-w-2xl mx-auto">
            Contact us to set up your account
          </p>
        </motion.div>

        {/* Small Payment Icons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mb-8 bg-dark-400/30 backdrop-blur-sm border border-primary-500/20 rounded-xl p-4 md:p-6 max-w-3xl mx-auto"
        >
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 mx-auto">
            {paymentMethods.map((method) => (
              <div 
                key={method.id}
                className={`${method.id === 'wise' || method.id === 'visa' ? 'bg-white' : 'bg-dark-400/30 backdrop-blur-sm'} border border-primary-500/20 rounded-lg p-1 flex items-center justify-center w-12 h-12 mx-auto`}
              >
                <img src={method.icon} alt={method.name} className="max-h-8 max-w-full" />
              </div>
            ))}
          </div>
        </motion.div>

        {/* Contact Buttons Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mb-16"
        >
          <div className="bg-dark-400/30 backdrop-blur-sm border border-primary-500/20 rounded-xl p-6 md:p-8 max-w-3xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-center mb-6">Contact Us 💬</h2>
            <p className="text-center text-blue-100/80 mb-8">
              Reach out to us through any of these platforms and we'll set up your account in less than 10 minutes
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleWhatsAppContact}
                className="flex items-center justify-center gap-3 py-4 px-6 bg-gradient-to-r from-green-500 to-green-600 rounded-lg hover:shadow-lg transition-all duration-300"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                <span>WhatsApp</span>
              </motion.button>
              
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleInstagramContact}
                className="flex items-center justify-center gap-3 py-4 px-6 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg hover:shadow-lg transition-all duration-300"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                </svg>
                <span>Instagram</span>
              </motion.button>
              
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleTelegramContact}
                className="flex items-center justify-center gap-3 py-4 px-6 bg-gradient-to-r from-blue-400 to-blue-500 rounded-lg hover:shadow-lg transition-all duration-300"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                </svg>
                <span>Telegram</span>
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* Pricing Plans */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mb-16 bg-dark-400/30 backdrop-blur-sm border border-primary-500/20 rounded-xl p-6 md:p-8 max-w-3xl mx-auto"
        >
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-10">Simple Pricing 💲</h2>
          
          <div className="grid grid-cols-2 md:grid-cols-2 gap-4 md:gap-8 mx-auto">
            {pricingPlans.map((plan, index) => (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 + (index * 0.1) }}
                className={`bg-dark-400/30 backdrop-blur-sm border ${plan.highlight ? 'border-primary-500/40' : 'border-primary-500/20'} rounded-xl overflow-hidden shadow-lg hover:shadow-primary-500/10 transition-all duration-300 flex flex-col h-full`}
              >
                <div className="p-4 md:p-6 text-center flex-grow">
                  <h3 className="text-xl md:text-2xl font-bold text-white mb-2">{plan.name}</h3>
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-3xl md:text-4xl font-bold text-white">${plan.price}</span>
                    <span className="text-blue-200/70 font-light">/{plan.period}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
        
        {/* How It Works - Combined in One Box */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="mb-16"
        >
          <div className="bg-dark-400/30 backdrop-blur-sm border border-primary-500/20 rounded-xl p-6 md:p-8 max-w-3xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-center mb-8">How It Works 🔍</h2>
            
            <div className="flex flex-col space-y-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                  <span className="text-lg font-bold">1</span>
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-1">Contact Us 📱</h3>
                  <p className="text-blue-100/70">Reach out through WhatsApp, Instagram, or Telegram</p>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                  <span className="text-lg font-bold">2</span>
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-1">Make Payment 💰</h3>
                  <p className="text-blue-100/70">Choose your preferred payment method</p>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                  <span className="text-lg font-bold">3</span>
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-1">Get Access 🔑</h3>
                  <p className="text-blue-100/70">Receive your login details within 15-20 minutes</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Footer */}
      <footer className="bg-dark-500/30 backdrop-blur-md border-t border-primary-500/10 py-8 relative z-10">
        <div className="container mx-auto px-4 text-center">
          <p className="text-blue-100/50 text-sm">
            © {new Date().getFullYear()} TraceMate. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default PaymentPage;
