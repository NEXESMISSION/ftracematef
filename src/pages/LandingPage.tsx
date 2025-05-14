
import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import Button from '../components/Button';

// Define the taglines for the hero section
const taglines = [
  "Transform Your Drawing Skills",
  "Trace Like a Pro",
  "Perfect Your Art",
  "Master Any Drawing"
];

// Define the testimonials
const testimonials = [
  {
    name: "Sarah J.",
    role: "Hobby Artist",
    content: "TraceMate has completely changed how I approach drawing. I can now create pieces I never thought possible!",
    avatar: "/assests/testimonials/avatar1.jpg"
  },
  {
    name: "Michael T.",
    role: "Art Student",
    content: "As a student, TraceMate helps me practice techniques and improve my skills faster than traditional methods.",
    avatar: "/assests/testimonials/avatar2.jpg"
  },
  {
    name: "Elena R.",
    role: "Professional Illustrator",
    content: "I use TraceMate for quick sketches and concept art. It's become an essential part of my creative workflow.",
    avatar: "/assests/testimonials/avatar3.jpg"
  }
];

// Define the FAQs
const faqs = [
  {
    question: "How does TraceMate work?",
    answer: "TraceMate uses your device's camera to overlay a reference image on your view. You can then trace directly on your paper while seeing the reference image through your screen."
  },
  {
    question: "Do I need special equipment?",
    answer: "No special equipment needed! Just your smartphone or tablet, and your regular drawing supplies."
  },
  {
    question: "Can I use my own images?",
    answer: "Absolutely! You can upload any image from your device to use as a reference."
  },
  {
    question: "Is TraceMate suitable for beginners?",
    answer: "Yes! TraceMate is perfect for artists of all skill levels, from complete beginners to professionals."
  },
  {
    question: "Do I need to upload my image each time?",
    answer: "Yes, TraceMate is designed for one-time image tracing. You'll need to upload your image each time you use the app."
  }
];

const LandingPage: React.FC = () => {
  const { user } = useAuth();
  const [currentTagline, setCurrentTagline] = useState(0);
  const [currentTestimonial, setCurrentTestimonial] = useState(0);
  
  // Refs for scroll animations
  const videosRef = useRef<HTMLDivElement>(null);
  const beforeAfterRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);
  const testimonialsRef = useRef<HTMLDivElement>(null);
  const faqRef = useRef<HTMLDivElement>(null);

  // Rotate through taglines
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTagline((prev) => (prev + 1) % taglines.length);
    }, 3000);
    
    return () => clearInterval(interval);
  }, []);

  // Rotate through testimonials
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTestimonial((prev) => (prev + 1) % testimonials.length);
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  // Function to scroll to a section
  const scrollToSection = (ref: React.RefObject<HTMLDivElement | null>) => {
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth' });
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
                <button onClick={() => scrollToSection(videosRef)} className="text-white hover:text-primary-100 transition-colors font-medium">How It Works</button>
                <button onClick={() => scrollToSection(featuresRef)} className="text-white hover:text-primary-100 transition-colors font-medium">Features</button>
                <button onClick={() => scrollToSection(faqRef)} className="text-white hover:text-primary-100 transition-colors font-medium">FAQ</button>
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
          <button 
            onClick={() => {
              scrollToSection(videosRef);
              document.getElementById('mobileMenu')?.classList.add('hidden');
            }} 
            className="text-white hover:text-primary-100 transition-colors font-medium py-3 px-4 rounded-lg bg-dark-400/30 border border-primary-500/10 text-center text-lg"
          >
            How It Works
          </button>
          <button 
            onClick={() => {
              scrollToSection(featuresRef);
              document.getElementById('mobileMenu')?.classList.add('hidden');
            }} 
            className="text-white hover:text-primary-100 transition-colors font-medium py-3 px-4 rounded-lg bg-dark-400/30 border border-primary-500/10 text-center text-lg"
          >
            Features
          </button>
          <button 
            onClick={() => {
              scrollToSection(faqRef);
              document.getElementById('mobileMenu')?.classList.add('hidden');
            }} 
            className="text-white hover:text-primary-100 transition-colors font-medium py-3 px-4 rounded-lg bg-dark-400/30 border border-primary-500/10 text-center text-lg"
          >
            FAQ
          </button>
        </div>
      </div>

      {/* Hero Section */}
      <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-dark-600">
        <div className="absolute inset-0 z-0">
          {/* Video Background */}
          <video 
            src="/assests/main.mp4" 
            autoPlay 
            muted 
            loop
            playsInline
            className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
          />
          <div className="absolute inset-0 bg-black/80"></div>
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary-600/20 via-transparent to-transparent opacity-70"></div>
          <div className="absolute top-[10%] right-[10%] w-[40%] h-[40%] rounded-full bg-primary-500/10 blur-[100px]"></div>
          <div className="absolute bottom-[10%] left-[10%] w-[30%] h-[30%] rounded-full bg-primary-500/10 blur-[100px]"></div>
        </div>
        
        <div className="container mx-auto px-4 relative z-10 pt-10 pb-16">
          <div className="flex flex-wrap items-center">
            <div className="w-full lg:w-8/12 px-4 mx-auto text-center">
              <motion.div 
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="space-y-3"
              >
                <div className="mb-4 flex justify-center">
                  <img src="/assests/logo/logo-dark-bg.png" alt="TraceMate Logo" className="h-20 md:h-28" />
                </div>
                <div className="inline-block">
                  <span className="px-4 py-1 text-sm rounded-full bg-primary-500/20 border border-primary-500/30 text-primary-300 backdrop-blur-sm font-medium">
                    Transform Your Drawing Skills
                  </span>
                </div>
                <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold font-heading leading-tight text-white">
                  TraceMate
                </h1>
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="text-xl md:text-2xl lg:text-3xl font-light leading-normal text-primary-200 h-16 flex items-center justify-center"
                >
                  <AnimatePresence mode="wait">
                    <motion.h2
                      key={currentTagline}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.3 }}
                      className="flex"
                    >
                      {taglines[currentTagline].split('').map((char, index) => (
                        <motion.span
                          key={index}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.2, delay: index * 0.03 }}
                        >
                          {char}
                        </motion.span>
                      ))}
                    </motion.h2>
                  </AnimatePresence>
                </motion.div>
                
                <div className="mt-10 flex flex-col items-center">
                  {user ? (
                    <div className="w-full max-w-xs">
                      <button 
                        onClick={() => window.location.href = '/dashboard'}
                        className="w-full py-4 px-8 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white font-medium rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center gap-2 text-lg"
                      >
                        <span>Go to Dashboard</span>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <div className="w-full max-w-md">
                      <div className="flex flex-col sm:flex-row gap-4 sm:gap-0 w-full">
                        <button 
                          onClick={() => window.location.href = '/app'}
                          className="flex-1 py-4 px-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-medium rounded-l-xl sm:rounded-r-none rounded-r-xl sm:border-r border-white/20 shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center gap-2 text-lg"
                        >
                          <span>Try It Free</span>
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                          </svg>
                        </button>
                        
                        <button 
                          onClick={() => window.location.href = '/signin'}
                          className="flex-1 py-4 px-6 bg-dark-400 hover:bg-dark-300 border border-primary-500/30 text-white font-medium rounded-r-xl sm:rounded-l-none rounded-l-xl shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center gap-2 text-lg"
                        >
                          <span>Sign In</span>
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                          </svg>
                        </button>
                      </div>
                      
                      <div className="mt-4 text-center text-primary-200/60 text-sm">
                        No credit card required • Free 5-minute sessions daily
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
      
      {/* How It Works Videos Section */}
      <div ref={videosRef} className="py-20 relative overflow-hidden">
        <div className="absolute top-[10%] left-[10%] w-[40%] h-[40%] rounded-full bg-primary-500/10 blur-[100px]"></div>
        <div className="absolute bottom-[10%] right-[10%] w-[30%] h-[30%] rounded-full bg-primary-500/10 blur-[100px]"></div>
        
        <div className="container mx-auto px-4 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-bold font-heading mb-4 text-white">
              How TraceMate Works
            </h2>
            <p className="text-xl text-primary-200 max-w-3xl mx-auto font-light">
              See TraceMate in action with these helpful tutorial videos
            </p>
          </motion.div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {['Upload & Align', 'Trace & Create', 'Share & Enjoy'].map((title, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-dark-300/70 backdrop-blur-sm border border-primary-500/20 rounded-xl overflow-hidden shadow-lg hover:shadow-primary-500/10 transition-all duration-300"
              >
                <div className="w-full h-full md:h-[400px] lg:h-[500px] aspect-[3/4] md:aspect-auto relative">
                  <video 
                    src={`/assests/vedios of how it works/${index + 1}.mp4`} 
                    className="w-full h-full object-cover pointer-events-none select-none"
                    autoPlay
                    muted
                    loop
                    playsInline
                  />
                  <div className="absolute inset-0 bg-transparent"></div>
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-bold font-heading mb-2 text-white">{title}</h3>
                  <p className="text-primary-200/80 font-light">
                    {index === 0 && 'Upload your reference image and align it with your camera view for perfect tracing.'}
                    {index === 1 && 'Use the overlay to trace your image with precision and create amazing artwork.'}
                    {index === 2 && 'Share your creations with friends and enjoy the satisfaction of your new skills.'}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Before & After Section */}
      <div ref={beforeAfterRef} className="py-20 relative overflow-hidden bg-dark-500/50">
        <div className="absolute -top-[10%] left-[10%] w-[30%] h-[30%] rounded-full bg-primary-500/10 blur-[100px]"></div>
        
        <div className="container mx-auto px-4 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-bold font-heading mb-4 text-white">
              Before & After
            </h2>
            <p className="text-xl text-primary-200 max-w-3xl mx-auto font-light">
              See the amazing transformations our users achieve with TraceMate
            </p>
          </motion.div>
          
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <motion.div
                initial={{ opacity: 0, x: -50 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="bg-dark-300/50 backdrop-blur-sm border border-primary-500/20 rounded-xl overflow-hidden shadow-lg hover:shadow-primary-500/10 transition-all duration-300"
              >
                <div className="p-4 border-b border-primary-500/20">
                  <h3 className="text-lg font-medium text-primary-200 font-heading">Before</h3>
                </div>
                <div className="p-4">
                  <img 
                    src="/assests/befor and after imges/befor.png" 
                    alt="Before using TraceMate" 
                    className="w-full h-auto rounded-lg shadow-lg"
                  />
                </div>
              </motion.div>
              
              <motion.div
                initial={{ opacity: 0, x: 50 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="bg-dark-300/50 backdrop-blur-sm border border-primary-500/20 rounded-xl overflow-hidden shadow-lg hover:shadow-primary-500/10 transition-all duration-300"
              >
                <div className="p-4 border-b border-primary-500/20">
                  <h3 className="text-lg font-medium text-primary-200 font-heading">After</h3>
                </div>
                <div className="p-4">
                  <img 
                    src="/assests/befor and after imges/after.png" 
                    alt="After using TraceMate" 
                    className="w-full h-auto rounded-lg shadow-lg"
                  />
                </div>
              </motion.div>
            </div>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="text-center mt-12 bg-dark-300/30 backdrop-blur-sm border border-primary-500/10 rounded-xl p-6 max-w-2xl mx-auto"
            >
              <h3 className="text-xl font-heading mb-2 text-white">Amazing Transformation</h3>
              <p className="text-primary-200/80 font-light">Created using TraceMate's real-time tracing technology. Our users achieve professional results with minimal effort!</p>
            </motion.div>
          </div>
        </div>
      </div>
      
      {/* Pricing Section */}
      <div className="py-20 relative overflow-hidden">
        <div className="absolute -top-[10%] right-[10%] w-[40%] h-[40%] rounded-full bg-primary-500/10 blur-[100px]"></div>
        <div className="absolute -bottom-[10%] left-[10%] w-[30%] h-[30%] rounded-full bg-primary-500/10 blur-[100px]"></div>
        
        <div className="container mx-auto px-4 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
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
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
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
                    <span className="text-white">1-minute sessions</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-6 h-6 text-primary-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-white">5 sessions per day</span>
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
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
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
                  onClick={() => window.location.href = '/payment'}
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
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
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
                  onClick={() => window.location.href = '/payment'}
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
      
      {/* Testimonials Section */}
      <div ref={testimonialsRef} className="py-20 relative overflow-hidden bg-dark-500/50">
        <div className="absolute -bottom-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-primary-500/10 blur-[100px]"></div>
        
        <div className="container mx-auto px-4 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <span className="px-4 py-1 text-sm rounded-full bg-primary-500/20 border border-primary-500/30 text-white backdrop-blur-sm font-medium">
              What Our Users Say
            </span>
            <h2 className="text-4xl font-bold font-heading mt-6 mb-4 text-white">
              Testimonials
            </h2>
            <p className="text-xl text-white max-w-3xl mx-auto font-light">
              Join thousands of satisfied artists who use TraceMate daily
            </p>
          </motion.div>
          
          <div className="max-w-4xl mx-auto">
            <div className="relative h-72 overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentTestimonial}
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -50 }}
                  transition={{ duration: 0.5 }}
                  className="absolute inset-0"
                >
                  <div className="bg-dark-300/50 backdrop-blur-sm border border-primary-500/20 rounded-xl p-8 h-full flex flex-col justify-center">
                    <p className="text-xl text-primary-100 mb-6 italic font-light">"{testimonials[currentTestimonial].content}"</p>
                    <div className="flex items-center">
                      {testimonials[currentTestimonial].avatar ? (
                        <img 
                          src={testimonials[currentTestimonial].avatar} 
                          alt={`${testimonials[currentTestimonial].name} avatar`} 
                          className="w-10 h-10 rounded-full object-cover border-2 border-primary-500/50 mr-3"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-primary-500/20 flex items-center justify-center text-primary-300 font-medium mr-3">
                          {testimonials[currentTestimonial].name.charAt(0)}
                        </div>
                      )}
                      <div>
                        <h4 className="text-white font-medium">{testimonials[currentTestimonial].name}</h4>
                        <p className="text-primary-300 text-sm">{testimonials[currentTestimonial].role}</p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
            
            <div className="flex justify-center mt-8">
              {testimonials.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentTestimonial(index)}
                  className={`w-3 h-3 mx-1 rounded-full transition-all duration-300 ${index === currentTestimonial ? 'bg-gradient-to-r from-primary-500 to-primary-600 scale-125' : 'bg-dark-100 hover:bg-dark-50'}`}
                  aria-label={`Go to testimonial ${index + 1}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
      
      {/* FAQ Section */}
      <div ref={faqRef} className="py-20 relative overflow-hidden bg-gradient-to-b from-dark-500 to-dark-600">
        <div className="absolute -bottom-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-primary-500/10 blur-[100px]"></div>
        
        <div className="container mx-auto px-4 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <span className="px-4 py-1 text-sm rounded-full bg-primary-500/20 border border-primary-500/30 text-white backdrop-blur-sm font-medium">
              Got Questions?
            </span>
            <h2 className="text-4xl font-bold font-heading mt-6 mb-4 text-white">
              Frequently Asked Questions
            </h2>
            <p className="text-xl text-white max-w-3xl mx-auto font-light">
              Find answers to common questions about TraceMate
            </p>
          </motion.div>
          
          <div className="flex flex-wrap justify-center">
            <div className="w-full md:w-8/12 space-y-6">
              {faqs.map((faq, index) => (
                <motion.div 
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="bg-dark-300/70 backdrop-blur-sm border border-primary-500/30 rounded-xl overflow-hidden shadow-lg hover:shadow-primary-500/10 transition-all duration-300"
                >
                  <details className="group">
                    <summary className="flex justify-between items-center font-medium cursor-pointer list-none p-6 text-white">
                      <span className="text-lg font-heading">{faq.question}</span>
                      <span className="transition duration-300 group-open:rotate-180 bg-primary-500/20 p-2 rounded-full">
                        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                        </svg>
                      </span>
                    </summary>
                    <div className="p-6 border-t border-primary-500/20 bg-dark-400/70">
                      <p className="text-white font-light">{faq.answer}</p>
                    </div>
                  </details>
                </motion.div>
              ))}
            </div>
          </div>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="text-center mt-16"
          >
            <Button 
              to="/app" 
              variant="blue" 
              size="md" 
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              }
            >
              Get Started Now
            </Button>
          </motion.div>
        </div>
      </div>
      
      {/* Call to Action Section */}
      <div className="py-20 relative overflow-hidden">
        <div className="absolute -bottom-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-primary-500/10 blur-[100px]"></div>
        
        <div className="container mx-auto px-4 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="text-center max-w-3xl mx-auto bg-dark-300/50 backdrop-blur-sm border border-primary-500/20 rounded-xl p-10"
          >
            <h2 className="text-4xl font-bold font-heading mb-6 text-white">
              Ready to Transform Your Drawing Skills?
            </h2>
            <p className="text-xl text-primary-200/90 mb-8 font-light">
              Join thousands of artists who use TraceMate to create amazing artwork
            </p>
            <Button 
              to="/app" 
              variant="primary" 
              size="lg" 
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              }
            >
              Get Started Now
            </Button>
          </motion.div>
        </div>
      </div>
      
      {/* Footer */}
      <footer className="relative py-12 overflow-hidden bg-dark-600">
        <div className="absolute inset-0 bg-gradient-to-b from-dark-500 to-dark-700 z-0"></div>
        <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-primary-500 to-primary-600"></div>
        
        <div className="container mx-auto px-4 relative z-10">
          <div className="flex flex-wrap justify-between items-center">
            <div className="w-full md:w-4/12 px-4 mb-8 md:mb-0">
              <div className="flex items-center">
                <img src="/assests/logo/logo-dark-bg.png" alt="TraceMate Logo" className="h-10 mr-3" />
                <h3 className="text-2xl font-bold font-heading text-white">TraceMate</h3>
              </div>
              <p className="text-primary-200/70 mt-3 font-light">Transform your drawing skills with real-time tracing</p>
            </div>
            <div className="w-full md:w-6/12 px-4">
              <div className="flex flex-wrap justify-end">
                {/* Footer links removed as requested */}
              </div>
            </div>
          </div>
          <div className="text-center mt-8 text-sm text-primary-200/50">
            &copy; {new Date().getFullYear()} TraceMate. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
