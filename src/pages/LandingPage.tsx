import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';

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
    question: "Can I save my progress?",
    answer: "Yes, you can save your work at any stage and come back to it later."
  }
];



const LandingPage: React.FC = () => {
  const { user } = useAuth();
  const [currentTagline, setCurrentTagline] = useState(0);
  const [currentTestimonial, setCurrentTestimonial] = useState(0);
  
  // Refs for scroll animations
  const videosRef = useRef<HTMLDivElement>(null);
  const beforeAfterRef = useRef<HTMLDivElement>(null);
  const testimonialsRef = useRef<HTMLDivElement>(null);
  const faqRef = useRef<HTMLDivElement>(null);

  // Rotate through taglines
  React.useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTagline((prev) => (prev + 1) % taglines.length);
    }, 3000);
    
    return () => clearInterval(interval);
  }, []);

  // Rotate through testimonials
  React.useEffect(() => {
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
              <h3 className="text-2xl font-bold font-heading bg-clip-text text-transparent bg-gradient-to-r from-primary-400 to-primary-600">TraceMate</h3>
            </div>
            <div className="hidden md:flex space-x-8 items-center">
              <button onClick={() => scrollToSection(videosRef)} className="text-white hover:text-primary-100 transition-colors font-medium">How It Works</button>
              <button onClick={() => scrollToSection(beforeAfterRef)} className="text-white hover:text-primary-100 transition-colors font-medium">Examples</button>
              <button onClick={() => scrollToSection(testimonialsRef)} className="text-white hover:text-primary-100 transition-colors font-medium">Testimonials</button>
              {user ? (
                <Link to="/dashboard">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="px-5 py-2 rounded-lg font-medium relative overflow-hidden group"
                  >
                    <span className="absolute inset-0 bg-gradient-to-r from-orange-600 to-orange-500 group-hover:from-orange-500 group-hover:to-orange-400 transition-all duration-300"></span>
                    <span className="relative text-white flex items-center justify-center">Go to Dashboard</span>
                  </motion.button>
                </Link>
              ) : (
                <Link to="/payment">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="px-5 py-2 rounded-lg font-medium relative overflow-hidden group"
                  >
                    <span className="absolute inset-0 bg-gradient-to-r from-orange-600 to-orange-500 group-hover:from-orange-500 group-hover:to-orange-400 transition-all duration-300"></span>
                    <span className="relative text-white flex items-center justify-center">Try For Free</span>
                  </motion.button>
                </Link>
              )}
            </div>
            <button className="md:hidden text-white" onClick={() => document.getElementById('mobileMenu')?.classList.toggle('hidden')}>
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            
            {/* Mobile Menu */}
            <div id="mobileMenu" className="hidden absolute top-full left-0 right-0 bg-dark-500/95 backdrop-blur-md p-4 rounded-b-lg border-t border-primary-500/20 z-50">
              <div className="flex flex-col space-y-4 py-2">
                <button onClick={() => {
                  scrollToSection(videosRef);
                  document.getElementById('mobileMenu')?.classList.add('hidden');
                }} className="text-white hover:text-primary-100 transition-colors font-medium py-2">How It Works</button>
                <button onClick={() => {
                  scrollToSection(beforeAfterRef);
                  document.getElementById('mobileMenu')?.classList.add('hidden');
                }} className="text-white hover:text-primary-100 transition-colors font-medium py-2">Examples</button>
                <button onClick={() => {
                  scrollToSection(testimonialsRef);
                  document.getElementById('mobileMenu')?.classList.add('hidden');
                }} className="text-white hover:text-primary-100 transition-colors font-medium py-2">Testimonials</button>
                <Link to="/login" className="w-full">
                  <button className="w-full py-2 px-4 bg-primary-500/20 border border-primary-500/30 rounded-lg text-white font-medium hover:bg-primary-500/30 transition-colors">
                    Sign In
                  </button>
                </Link>
                <Link to="/payment" className="w-full">
                  <button className="w-full py-2 px-4 bg-gradient-to-r from-orange-600 to-orange-500 rounded-lg text-white font-medium hover:from-orange-500 hover:to-orange-400 transition-colors">
                    Try For Free
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </nav>

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
          <div className="absolute inset-0 bg-gradient-to-b from-dark-600/90 via-dark-600/80 to-dark-500/90"></div>
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary-600/20 via-transparent to-transparent opacity-70"></div>
          <div className="absolute top-[10%] right-[10%] w-[40%] h-[40%] rounded-full bg-primary-500/10 blur-[100px]"></div>
          <div className="absolute bottom-[10%] left-[10%] w-[30%] h-[30%] rounded-full bg-primary-500/10 blur-[100px]"></div>
        </div>
        
        <div className="container mx-auto px-4 relative z-10 pt-20 pb-32">
          <div className="flex flex-wrap items-center">
            <div className="w-full lg:w-8/12 px-4 mx-auto text-center">
              <motion.div 
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              >
                <div className="mb-8 flex justify-center">
                  <img src="/assests/logo/logo-dark-bg.png" alt="TraceMate Logo" className="h-24 md:h-32" />
                </div>
                <div className="mb-4 inline-block">
                  <span className="px-4 py-1 text-sm rounded-full bg-primary-500/20 border border-primary-500/30 text-primary-300 backdrop-blur-sm font-medium">
                    Transform Your Drawing Skills
                  </span>
                </div>
                <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold font-heading leading-tight mt-4 mb-6 bg-clip-text text-transparent bg-gradient-to-r from-primary-400 to-primary-600">
                  TraceMate
                </h1>
                <motion.h2 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="text-xl md:text-2xl lg:text-3xl font-light leading-normal mt-0 mb-8 text-primary-200 h-16"
                >
                  {taglines[currentTagline]}
                </motion.h2>
                
                <div className="flex flex-col sm:flex-row gap-4 justify-center mt-10">
                  {user ? (
                    <Link to="/dashboard">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="px-8 py-4 rounded-lg font-medium relative overflow-hidden group text-lg"
                      >
                        <span className="absolute inset-0 bg-gradient-to-r from-orange-600 to-orange-500 group-hover:from-orange-500 group-hover:to-orange-400 transition-all duration-300"></span>
                        <span className="relative text-white flex items-center justify-center gap-2 font-heading">
                          Go to Dashboard
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                          </svg>
                        </span>
                      </motion.button>
                    </Link>
                  ) : (
                    <div className="flex flex-col sm:flex-row gap-4">
                      <Link to="/payment">
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="px-8 py-4 rounded-lg font-medium relative overflow-hidden group text-lg"
                        >
                          <span className="absolute inset-0 bg-gradient-to-r from-orange-600 to-orange-500 group-hover:from-orange-500 group-hover:to-orange-400 transition-all duration-300"></span>
                          <span className="relative text-white flex items-center justify-center gap-2 font-heading">
                            Try For Free
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                            </svg>
                          </span>
                        </motion.button>
                      </Link>
                      <Link to="/login">
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="px-8 py-4 rounded-lg font-medium bg-dark-300/50 border border-primary-500/30 backdrop-blur-sm hover:bg-dark-300/80 transition-all duration-300 text-white text-lg"
                        >
                          Sign In
                        </motion.button>
                      </Link>
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
        <div className="absolute -top-[10%] right-[10%] w-[30%] h-[30%] rounded-full bg-primary-500/10 blur-[100px]"></div>
        
        <div className="container mx-auto px-4 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <span className="px-4 py-1 text-sm rounded-full bg-primary-500/20 border border-primary-500/30 text-white backdrop-blur-sm font-medium">
              Watch & Learn
            </span>
            <h2 className="text-4xl font-bold font-heading mt-6 mb-4 text-white">
              How TraceMate Works
            </h2>
            <p className="text-xl text-white max-w-3xl mx-auto font-light">
              See TraceMate in action with these helpful tutorial videos
            </p>
          </motion.div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[1, 2, 3].map((_, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-dark-300/50 backdrop-blur-sm border border-primary-500/20 rounded-xl overflow-hidden"
              >
                <div className="aspect-video w-full md:h-[300px] lg:h-[400px]">
                  <video 
                    src={`/assests/vedios of how it works/video${index + 1}.mp4`} 
                    autoPlay 
                    muted 
                    loop
                    playsInline
                    className="w-full h-full object-cover pointer-events-none select-none"
                    poster="/assests/logo/logo-dark-bg.png"
                  />
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-semibold mb-3 text-white font-heading">
                    {index === 0 ? "Getting Started with TraceMate" : 
                     index === 1 ? "Advanced Tracing Techniques" : 
                     "Creating Complex Artwork"}
                  </h3>
                  <p className="text-white/80">
                    {index === 0 ? "Learn the basics of setting up and using TraceMate for your first project." : 
                     index === 1 ? "Discover pro tips and tricks to enhance your tracing skills." : 
                     "See how to tackle more detailed and complex drawings with TraceMate."}
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
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <span className="px-4 py-1 text-sm rounded-full bg-primary-500/20 border border-primary-500/30 text-white backdrop-blur-sm font-medium">
              Real Results
            </span>
            <h2 className="text-4xl font-bold font-heading mt-6 mb-4 text-white">
              Before & After
            </h2>
            <p className="text-xl text-white max-w-3xl mx-auto font-light">
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
                className="bg-dark-300/50 backdrop-blur-sm border border-primary-500/20 rounded-xl overflow-hidden"
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
                className="bg-dark-300/50 backdrop-blur-sm border border-primary-500/20 rounded-xl overflow-hidden"
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
              <h3 className="text-xl font-heading mb-2">Amazing Transformation</h3>
              <p className="text-primary-200/80">Created using TraceMate's real-time tracing technology. Our users achieve professional results with minimal effort!</p>
            </motion.div>
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
            <h2 className="text-4xl font-bold font-heading mb-6 bg-clip-text text-transparent bg-gradient-to-r from-primary-400 to-primary-600">
              Ready to Transform Your Drawing Skills?
            </h2>
            <p className="text-xl text-primary-200/90 mb-8 font-light">
              Join thousands of artists who use TraceMate to create amazing artwork
            </p>
            <Link to="/payment">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-8 py-4 rounded-lg font-medium relative overflow-hidden group text-lg"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-primary-600 to-primary-500 group-hover:from-primary-500 group-hover:to-primary-400 transition-all duration-300"></span>
                <span className="relative text-white flex items-center justify-center gap-2 font-heading">
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
        <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-primary-500 to-primary-600"></div>
        
        <div className="container mx-auto px-4 relative z-10">
          <div className="flex flex-wrap justify-between items-center">
            <div className="w-full md:w-4/12 px-4 mb-8 md:mb-0">
              <div className="flex items-center">
                <img src="/assests/logo/logo-dark-bg.png" alt="TraceMate Logo" className="h-10 mr-3" />
                <h3 className="text-2xl font-bold font-heading bg-clip-text text-transparent bg-gradient-to-r from-primary-400 to-primary-600">TraceMate</h3>
              </div>
              <p className="text-primary-200/70 mt-3 font-light">Transform your drawing skills with real-time tracing</p>
            </div>
            <div className="w-full md:w-6/12 px-4">
              <div className="flex flex-wrap justify-end">
                <div className="px-4 mb-4">
                  <a href="#" className="text-primary-300 hover:text-primary-100 transition-colors duration-300 font-medium">
                    Privacy Policy
                  </a>
                </div>
                <div className="px-4 mb-4">
                  <a href="#" className="text-primary-300 hover:text-primary-100 transition-colors duration-300 font-medium">
                    Terms of Service
                  </a>
                </div>
                <div className="px-4 mb-4">
                  <a href="#" className="text-primary-300 hover:text-primary-100 transition-colors duration-300 font-medium">
                    Contact
                  </a>
                </div>
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
