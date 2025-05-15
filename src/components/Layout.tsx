import React from 'react';
import { Link } from 'react-router-dom';

interface LayoutProps {
  children?: React.ReactNode;
  hideNav?: boolean;
  hideFooter?: boolean;
}

const Layout: React.FC<LayoutProps> = ({ children, hideNav = false, hideFooter = false }) => {
  const currentYear = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-gradient-to-b from-dark-400 to-dark-600 text-white font-sans">
      {/* Navigation Bar */}
      {!hideNav && (
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
              
              {/* Mobile Menu */}
              <div 
                id="mobileMenu" 
                className="hidden fixed top-[60px] left-0 right-0 bottom-0 flex-col bg-dark-500/95 backdrop-blur-md p-6 z-50 overflow-y-auto"
              >
                <div className="flex flex-col space-y-6 py-4">
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
            </div>
          </div>
        </nav>
      )}

      {/* Main Content */}
      <main className={`${!hideNav ? 'pt-16' : ''}`}>
        {children}
      </main>

      {/* Footer */}
      {!hideFooter && (
        <footer className="relative py-12 overflow-hidden bg-dark-600">
          <div className="absolute inset-0 bg-gradient-to-b from-dark-500 to-dark-700 z-0"></div>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-primary-500 to-primary-600"></div>
          
          <div className="container mx-auto px-4 relative z-10">
            <div className="flex flex-wrap justify-between items-center">
              <div className="w-full md:w-4/12 px-4 mb-8 md:mb-0">
                <div className="flex items-center">
                  <img src="/assets/logo/logo-dark-bg.png" alt="TraceMate Logo" className="h-10 mr-3" />
                  <h3 className="text-2xl font-bold font-heading text-white">TraceMate</h3>
                </div>
                <p className="text-primary-200/70 mt-3 font-light">Transform your drawing skills with real-time tracing</p>
              </div>
            </div>
            <div className="text-center mt-8 text-sm text-primary-200/50">
              &copy; {currentYear} TraceMate. All rights reserved.
            </div>
          </div>
        </footer>
      )}
    </div>
  );
};

export default Layout;
