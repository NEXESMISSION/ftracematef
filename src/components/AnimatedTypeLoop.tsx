import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AnimatedTypeLoopProps {
  phrases: string[];
  typingSpeed?: number;
  deletingSpeed?: number;
  pauseDuration?: number;
  className?: string;
}

const AnimatedTypeLoop: React.FC<AnimatedTypeLoopProps> = ({
  phrases,
  typingSpeed = 100,
  deletingSpeed = 50,
  pauseDuration = 2000,
  className = '',
}) => {
  const [currentPhraseIndex, setCurrentPhraseIndex] = useState(0);
  const [currentText, setCurrentText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    
    // If we're paused, wait before starting to delete
    if (isPaused) {
      timeout = setTimeout(() => {
        setIsPaused(false);
        setIsDeleting(true);
      }, pauseDuration);
      return () => clearTimeout(timeout);
    }

    const currentPhrase = phrases[currentPhraseIndex];
    
    // If we're deleting
    if (isDeleting) {
      if (currentText === '') {
        // Move to the next phrase when deletion is complete
        setIsDeleting(false);
        setCurrentPhraseIndex((prevIndex) => (prevIndex + 1) % phrases.length);
      } else {
        // Delete one character
        timeout = setTimeout(() => {
          setCurrentText(currentText.slice(0, -1));
        }, deletingSpeed);
      }
    } 
    // If we're typing
    else {
      if (currentText === currentPhrase) {
        // Pause at the end of typing
        setIsPaused(true);
      } else {
        // Type one character
        timeout = setTimeout(() => {
          setCurrentText(currentPhrase.slice(0, currentText.length + 1));
        }, typingSpeed);
      }
    }

    return () => clearTimeout(timeout);
  }, [currentText, currentPhraseIndex, isDeleting, isPaused, phrases, typingSpeed, deletingSpeed, pauseDuration]);

  return (
    <div className={`min-h-[1.5em] ${className}`}>
      <AnimatePresence mode="wait">
        <motion.span
          key={currentText}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="inline-block"
        >
          {currentText}
          <span className="animate-blink">|</span>
        </motion.span>
      </AnimatePresence>
    </div>
  );
};

export default AnimatedTypeLoop;
