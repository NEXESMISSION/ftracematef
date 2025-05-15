import React, { useState, useRef, useEffect } from 'react';
import { motion, useMotionValue } from 'framer-motion';

interface ComparisonSliderProps {
  beforeImage: string;
  afterImage: string;
  beforeAlt?: string;
  afterAlt?: string;
  className?: string;
}

const ComparisonSlider: React.FC<ComparisonSliderProps> = ({
  beforeImage,
  afterImage,
  beforeAlt = 'Before image',
  afterAlt = 'After image',
  className = '',
}) => {
  const [sliderWidth, setSliderWidth] = useState(0);
  const [sliderPosition, setSliderPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const sliderX = useMotionValue(0);

  // Initialize slider width on mount and window resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setSliderWidth(containerRef.current.offsetWidth);
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);

    return () => {
      window.removeEventListener('resize', updateDimensions);
    };
  }, []);

  // Handle slider drag
  const handleDrag = (_: any, info: any) => {
    if (containerRef.current) {
      const newPosition = Math.max(0, Math.min(100, (info.point.x / sliderWidth) * 100));
      setSliderPosition(newPosition);
    }
  };

  return (
    <div 
      ref={containerRef}
      className={`relative overflow-hidden rounded-lg ${className}`}
      aria-label="Image comparison slider"
    >
      {/* After image (full width) */}
      <div className="w-full">
        <img 
          src={afterImage} 
          alt={afterAlt} 
          className="w-full h-auto object-cover"
          loading="lazy"
        />
      </div>

      {/* Before image (clipped by slider position) */}
      <div 
        className="absolute top-0 left-0 h-full overflow-hidden"
        style={{ width: `${sliderPosition}%` }}
      >
        <img 
          src={beforeImage} 
          alt={beforeAlt} 
          className="h-full object-cover"
          style={{ width: `${sliderWidth}px` }}
          loading="lazy"
        />
      </div>

      {/* Slider handle */}
      <motion.div
        className="absolute top-0 bottom-0 w-1 bg-white cursor-ew-resize shadow-lg"
        style={{ 
          left: `${sliderPosition}%`,
          x: sliderX,
          touchAction: 'none'
        }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0}
        dragMomentum={false}
        onDrag={handleDrag}
      >
        {/* Slider handle circle */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-md">
          <svg 
            className="w-4 h-4 text-gray-700" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M8 9l4-4 4 4m0 6l-4 4-4-4" 
            />
          </svg>
        </div>
      </motion.div>
    </div>
  );
};

export default ComparisonSlider;
