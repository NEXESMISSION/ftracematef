import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Testimonial } from '../types';

interface TestimonialCarouselProps {
  testimonials: Testimonial[];
  autoPlay?: boolean;
  interval?: number;
  className?: string;
}

const TestimonialCarousel: React.FC<TestimonialCarouselProps> = ({
  testimonials,
  autoPlay = true,
  interval = 5000,
  className = '',
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(1); // 1 for right, -1 for left

  // Auto-rotate testimonials if autoPlay is true
  useEffect(() => {
    if (!autoPlay) return;

    const timer = setInterval(() => {
      setDirection(1);
      setCurrentIndex((prevIndex) => (prevIndex + 1) % testimonials.length);
    }, interval);

    return () => clearInterval(timer);
  }, [autoPlay, interval, testimonials.length]);

  // Handle manual navigation
  const handlePrevious = () => {
    setDirection(-1);
    setCurrentIndex((prevIndex) => 
      prevIndex === 0 ? testimonials.length - 1 : prevIndex - 1
    );
  };

  const handleNext = () => {
    setDirection(1);
    setCurrentIndex((prevIndex) => (prevIndex + 1) % testimonials.length);
  };

  // Handle dot navigation
  const handleDotClick = (index: number) => {
    setDirection(index > currentIndex ? 1 : -1);
    setCurrentIndex(index);
  };

  // Animation variants
  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction > 0 ? -300 : 300,
      opacity: 0,
    }),
  };

  return (
    <div className={`relative ${className}`}>
      <div className="overflow-hidden relative">
        <AnimatePresence custom={direction} initial={false}>
          <motion.div
            key={currentIndex}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.5 }}
            className="w-full"
          >
            <div className="text-center p-6">
              <p className="text-xl italic text-gray-700 dark:text-gray-300 mb-6">
                "{testimonials[currentIndex].text}"
              </p>
              <p className="font-bold text-gray-900 dark:text-white">
                — {testimonials[currentIndex].initials}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation buttons */}
      <button
        onClick={handlePrevious}
        className="absolute top-1/2 left-0 transform -translate-y-1/2 bg-white dark:bg-gray-800 p-2 rounded-full shadow-md text-gray-700 dark:text-gray-300 focus:outline-none"
        aria-label="Previous testimonial"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      
      <button
        onClick={handleNext}
        className="absolute top-1/2 right-0 transform -translate-y-1/2 bg-white dark:bg-gray-800 p-2 rounded-full shadow-md text-gray-700 dark:text-gray-300 focus:outline-none"
        aria-label="Next testimonial"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Dot indicators */}
      <div className="flex justify-center mt-4">
        {testimonials.map((_, index) => (
          <button
            key={index}
            onClick={() => handleDotClick(index)}
            className={`mx-1 w-3 h-3 rounded-full focus:outline-none ${
              currentIndex === index 
                ? 'bg-indigo-600' 
                : 'bg-gray-300 dark:bg-gray-600'
            }`}
            aria-label={`Go to testimonial ${index + 1}`}
            aria-current={currentIndex === index ? 'true' : 'false'}
          />
        ))}
      </div>
    </div>
  );
};

export default TestimonialCarousel;
