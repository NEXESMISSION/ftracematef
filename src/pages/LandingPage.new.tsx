import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { Testimonial, FAQ } from '../types';

// Sample testimonials
const testimonials: Testimonial[] = [
  { 
    text: "TraceMate helped my daughter learn to draw in just a week!", 
    initials: "A.S.",
    avatar: "/assests/avatars/avatar1.png",
    role: "Parent & Art Enthusiast"
  },
  { 
    text: "The overlay feature is perfect for practicing my sketching skills.", 
    initials: "M.K.",
    avatar: "/assests/avatars/avatar2.png",
    role: "Digital Artist"
  },
  { 
    text: "I've tried many tracing apps, but this one is by far the most intuitive.", 
    initials: "J.D.",
    avatar: "/assests/avatars/avatar3.png",
    role: "Art Student"
  },
  { 
    text: "Great for creating social media content with my own artistic twist.", 
    initials: "L.R.",
    avatar: "/assests/avatars/avatar4.png",
    role: "Content Creator"
  },
];

// Sample FAQs
const faqs: FAQ[] = [
  {
    question: "How long until I get credentials after payment?",
    answer: "Once payment is confirmed, you'll receive your login credentials within 24 hours via email."
  },
  {
    question: "Can I switch between front and back cameras?",
    answer: "Yes! TraceMate allows you to easily switch between front and back cameras with a single tap."
  },
  {
    question: "How many images can I trace per day?",
    answer: "Free users can trace for 1 minute per session, up to 5 sessions per day. Paid users have unlimited access."
  },
  {
    question: "Does TraceMate work offline?",
    answer: "TraceMate requires an internet connection for authentication and usage tracking, but the core tracing functionality works offline."
  },
];

// Animated taglines for hero section
const taglines = [
  "Turn Photos into Art with Ease",
  "Learn to Draw with Real-time Tracing",
  "Perfect Your Sketching Skills",
  "Create Amazing Artwork Anywhere",
  "Trace, Learn, and Master Drawing",
];

// Features list
const features = [
  {
    title: "Real-time Tracing",
    description: "Overlay your camera view with any image for perfect tracing every time.",
    icon: "📱",
    color: "from-blue-500 to-blue-600"
  },
  {
    title: "Adjustable Opacity",
    description: "Fine-tune the overlay transparency to match your preference and skill level.",
    icon: "🔍",
    color: "from-purple-500 to-purple-600"
  },
  {
    title: "Image Library",
    description: "Access a growing collection of templates or upload your own images to trace.",
    icon: "🖼️",
    color: "from-orange-500 to-orange-600"
  },
  {
    title: "Progress Tracking",
    description: "See your improvement over time with our built-in progress tracker.",
    icon: "📈",
    color: "from-green-500 to-green-600"
  }
];

const LandingPage: React.FC = () => {
  const { user, userRole } = useAuth();
  const [currentTagline, setCurrentTagline] = useState(0);
  const [currentTestimonial, setCurrentTestimonial] = useState(0);
  
  // Refs for scroll animations
  const featuresRef = useRef<HTMLDivElement>(null);
  const testimonialsRef = useRef<HTMLDivElement>(null);
  const faqRef = useRef<HTMLDivElement>(null);
  
  // Scroll animations
  const { scrollYProgress } = useScroll();
  const heroOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0.2]);
  
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
  
  // Scroll to section function
  const scrollToSection = (ref: React.RefObject<HTMLDivElement>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-dark-400 to-dark-600 text-white">
      {/* Hero Section */}
      <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
        {/* Background elements */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
          {/* Main gradient circles */}
          <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] rounded-full bg-blue-500/20 blur-[120px] animate-pulse-slow"></div>
          <div className="absolute top-[40%] -right-[5%] w-[40%] h-[40%] rounded-full bg-orange-500/20 blur-[120px] animate-pulse-slow"></div>
          <div className="absolute bottom-[10%] left-[20%] w-[30%] h-[30%] rounded-full bg-purple-500/15 blur-[100px] animate-pulse-slow"></div>
          
          {/* Small floating particles */}
          <div className="absolute top-1/4 left-1/4 w-2 h-2 rounded-full bg-blue-400 opacity-70 animate-float"></div>
          <div className="absolute top-3/4 left-1/3 w-3 h-3 rounded-full bg-orange-400 opacity-60 animate-float"></div>
          <div className="absolute top-1/2 right-1/4 w-4 h-4 rounded-full bg-purple-400 opacity-50 animate-float"></div>
        </div>
        
        <div className="container mx-auto px-4 relative z-10 pt-20 pb-32">
          <div className="flex flex-wrap items-center">
            <div className="w-full lg:w-6/12 px-4 mx-auto text-center">
              <motion.div 
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              >
                <div className="mb-4 inline-block">
                  <span className="px-4 py-1 text-sm rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-300 backdrop-blur-sm">
                    Transform Your Drawing Skills
                  </span>
                </div>
                <h1 className="text-6xl font-bold leading-tight mt-0 mb-6 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
                  TraceMate
                </h1>
                <AnimatePresence mode="wait">
                  <motion.h2 
                    key={currentTagline}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.5 }}
                    className="text-2xl md:text-3xl font-light leading-normal mt-0 mb-8 text-blue-200 h-16"
                  >
                    {taglines[currentTagline]}
                  </motion.h2>
                </AnimatePresence>
                
                <div className="flex flex-col sm:flex-row gap-4 justify-center mt-10">
                  <Link to="/payment">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="px-8 py-3 rounded-lg font-medium relative overflow-hidden group"
                    >
                      <span className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 group-hover:from-blue-500 group-hover:to-purple-500 transition-all duration-300"></span>
                      <span className="relative text-white flex items-center justify-center gap-2">
                        Get Started
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                        </svg>
                      </span>
                    </motion.button>
                  </Link>
                  
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => scrollToSection(featuresRef)}
                    className="px-8 py-3 rounded-lg font-medium bg-dark-300/50 border border-blue-500/30 backdrop-blur-sm hover:bg-dark-300/80 transition-all duration-300 text-blue-200"
                  >
                    Learn More
                  </motion.button>
                </div>
              </motion.div>
            </div>
            
            <div className="w-full lg:w-6/12 px-4 mt-16 lg:mt-0">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="relative"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-xl blur-xl"></div>
                <div className="relative bg-dark-300/50 backdrop-blur-md border border-blue-500/20 rounded-xl overflow-hidden shadow-2xl">
                  <img 
                    src="/assests/mockup/app-preview.png" 
                    alt="TraceMate App Preview" 
                    className="w-full h-auto"
                  />
                </div>
              </motion.div>
            </div>
          </div>
          
          {/* Scroll indicator */}
          <motion.div 
            className="absolute bottom-8 left-1/2 transform -translate-x-1/2"
            animate={{ y: [0, 10, 0] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          >
            <button 
              onClick={() => scrollToSection(featuresRef)}
              className="flex flex-col items-center text-blue-300/70 hover:text-blue-300 transition-colors"
            >
              <span className="text-sm mb-2">Scroll to explore</span>
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </button>
          </motion.div>
        </div>
      </div>
      
      {/* Features Section */}
      <div ref={featuresRef} className="py-20 relative overflow-hidden">
        <div className="absolute -top-[10%] right-[10%] w-[30%] h-[30%] rounded-full bg-blue-500/10 blur-[100px]"></div>
        
        <div className="container mx-auto px-4 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <span className="px-4 py-1 text-sm rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-300 backdrop-blur-sm">
              Powerful Features
            </span>
            <h2 className="text-4xl font-bold mt-6 mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
              Everything You Need to Create Amazing Art
            </h2>
            <p className="text-xl text-blue-200/80 max-w-3xl mx-auto">
              TraceMate combines powerful tracing tools with an intuitive interface to help you create stunning artwork with ease.
            </p>
          </motion.div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-dark-300/50 backdrop-blur-sm border border-blue-500/20 rounded-xl p-6 hover:transform hover:scale-105 transition-all duration-300"
              >
                <div className={`w-12 h-12 rounded-full bg-gradient-to-r ${feature.color} flex items-center justify-center mb-4 text-2xl`}>
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold mb-3 text-white">{feature.title}</h3>
                <p className="text-blue-200/80">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Testimonials Section */}
      <div ref={testimonialsRef} className="py-20 relative overflow-hidden bg-dark-500/50">
        <div className="absolute -bottom-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-purple-500/10 blur-[100px]"></div>
        
        <div className="container mx-auto px-4 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <span className="px-4 py-1 text-sm rounded-full bg-orange-500/20 border border-orange-500/30 text-orange-300 backdrop-blur-sm">
              User Stories
            </span>
            <h2 className="text-4xl font-bold mt-6 mb-4 bg-clip-text text-transparent bg-gradient-to-r from-orange-400 to-red-500">
              What Our Users Say
            </h2>
          </motion.div>
          
          <div className="max-w-4xl mx-auto">
            <div className="relative h-64 overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentTestimonial}
                  initial={{ opacity: 0, x: 100 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  transition={{ duration: 0.5 }}
                  className="absolute inset-0"
                >
                  <div className="bg-dark-300/50 backdrop-blur-sm border border-orange-500/20 rounded-xl p-8 h-full flex flex-col justify-center">
                    <p className="text-xl text-blue-100 mb-6 italic">"{testimonials[currentTestimonial].text}"</p>
                    <div className="flex items-center">
                      {testimonials[currentTestimonial].avatar ? (
                        <img 
                          src={testimonials[currentTestimonial].avatar} 
                          alt={testimonials[currentTestimonial].initials} 
                          className="w-12 h-12 rounded-full object-cover mr-4 border-2 border-orange-500/30"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-gradient-to-r from-orange-500 to-red-500 flex items-center justify-center text-white font-medium mr-4">
                          {testimonials[currentTestimonial].initials}
                        </div>
                      )}
                      <div>
                        <div className="font-semibold text-white">{testimonials[currentTestimonial].initials}</div>
                        {testimonials[currentTestimonial].role && (
                          <div className="text-sm text-blue-200/70">{testimonials[currentTestimonial].role}</div>
                        )}
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
                  className={`w-3 h-3 mx-1 rounded-full transition-all duration-300 ${index === currentTestimonial ? 'bg-gradient-to-r from-orange-500 to-red-500 scale-125' : 'bg-dark-100 hover:bg-dark-50'}`}
                  aria-label={`Go to testimonial ${index + 1}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
      
      {/* FAQ Section */}
      <div ref={faqRef} className="py-20 relative overflow-hidden">
        <div className="absolute -bottom-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-orange-500/10 blur-[100px]"></div>
        
        <div className="container mx-auto px-4 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <span className="px-4 py-1 text-sm rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-300 backdrop-blur-sm">
              Got Questions?
            </span>
            <h2 className="text-4xl font-bold mt-6 mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
              Frequently Asked Questions
            </h2>
          </motion.div>
          
          <div className="flex flex-wrap justify-center">
            <div className="w-full md:w-8/12 space-y-4">
              {faqs.map((faq, index) => (
                <motion.div 
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="bg-dark-300/50 backdrop-blur-sm border border-blue-500/20 rounded-xl overflow-hidden"
                >
                  <details className="group">
                    <summary className="flex justify-between items-center font-medium cursor-pointer list-none p-5 text-white">
                      <span className="text-lg">{faq.question}</span>
                      <span className="transition duration-300 group-open:rotate-180">
                        <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                        </svg>
                      </span>
                    </summary>
                    <div className="p-5 border-t border-blue-500/20 bg-dark-400/50">
                      <p className="text-blue-200/90">{faq.answer}</p>
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
            <Link to="/payment">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-8 py-3 rounded-lg font-medium relative overflow-hidden group"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 group-hover:from-blue-500 group-hover:to-purple-500 transition-all duration-300"></span>
                <span className="relative text-white flex items-center justify-center gap-2">
                  Get Started Now
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </span>
              </motion.button>
            </Link>
          </motion.div>
        </div>
      </div>
      
      {/* Footer */}
      <footer className="relative py-12 overflow-hidden bg-dark-600">
        <div className="absolute inset-0 bg-gradient-to-b from-dark-500 to-dark-700 z-0"></div>
        <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500"></div>
        
        <div className="container mx-auto px-4 relative z-10">
          <div className="flex flex-wrap justify-between items-center">
            <div className="w-full md:w-4/12 px-4 mb-8 md:mb-0">
              <div className="flex items-center">
                <img src="/assests/logo/logo-dark-bg.png" alt="TraceMate Logo" className="h-10 mr-3" />
                <h3 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">TraceMate</h3>
              </div>
              <p className="text-blue-200/70 mt-3">Transform your drawing skills with real-time tracing</p>
            </div>
            <div className="w-full md:w-6/12 px-4">
              <div className="flex flex-wrap justify-end">
                <div className="px-4 mb-4">
                  <a href="#" className="text-blue-300 hover:text-blue-100 transition-colors duration-300">
                    Privacy Policy
                  </a>
                </div>
                <div className="px-4 mb-4">
                  <a href="#" className="text-blue-300 hover:text-blue-100 transition-colors duration-300">
                    Terms of Service
                  </a>
                </div>
                <div className="px-4 mb-4">
                  <a href="#" className="text-blue-300 hover:text-blue-100 transition-colors duration-300">
                    Contact
                  </a>
                </div>
              </div>
            </div>
          </div>
          <div className="text-center mt-8 text-sm text-blue-200/50">
            &copy; {new Date().getFullYear()} TraceMate. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
