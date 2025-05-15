import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FAQ } from '../types';

interface FaqAccordionProps {
  faqs: FAQ[];
  className?: string;
}

const FaqAccordion: React.FC<FaqAccordionProps> = ({ faqs, className = '' }) => {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  return (
    <div className={`w-full ${className}`}>
      {faqs.map((faq, index) => (
        <div 
          key={index} 
          className="border-b border-gray-200 dark:border-gray-700"
        >
          <button
            className="flex justify-between items-center w-full py-4 text-left focus:outline-none"
            onClick={() => toggleFaq(index)}
            aria-expanded={expandedIndex === index}
            aria-controls={`faq-content-${index}`}
          >
            <span className="text-lg font-medium text-gray-900 dark:text-white">
              {faq.question}
            </span>
            <motion.span
              animate={{ rotate: expandedIndex === index ? 180 : 0 }}
              transition={{ duration: 0.3 }}
              className="text-gray-500 dark:text-gray-400"
            >
              <svg 
                className="w-5 h-5" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M19 9l-7 7-7-7" 
                />
              </svg>
            </motion.span>
          </button>
          
          <AnimatePresence>
            {expandedIndex === index && (
              <motion.div
                id={`faq-content-${index}`}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <div className="py-3 text-gray-600 dark:text-gray-300">
                  {faq.answer}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
};

export default FaqAccordion;
