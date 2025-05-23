import React from 'react';
import { motion } from 'framer-motion';
import { OverlaySettings } from '../types';

interface OverlayControlsProps {
  settings: OverlaySettings;
  onSettingChange: (setting: keyof Omit<OverlaySettings, 'cornerTransforms'>, value: number) => void;
  onCameraSwitch: () => void;
  visible: boolean;
  className?: string;
  onReset?: () => void;
}

const OverlayControls: React.FC<OverlayControlsProps> = ({
  settings,
  onSettingChange,
  onCameraSwitch,
  visible,
  className = '',
  onReset,
}) => {
  // Animation variants for the controls panel
  const variants = {
    hidden: { y: '100%' },
    visible: { y: 0 },
  };

  return (
    <motion.div
      initial="hidden"
      animate={visible ? 'visible' : 'hidden'}
      variants={variants}
      transition={{ type: 'spring', damping: 20 }}
      className={`absolute bottom-0 left-0 right-0 bg-gray-900 bg-opacity-80 backdrop-blur-sm p-4 rounded-t-xl z-20 ${className}`}
    >
      {/* Opacity Slider */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <label htmlFor="opacity-slider" className="text-white text-sm">
            Opacity
          </label>
          <span className="text-white text-sm font-medium">
            {Math.round(settings.opacity * 100)}%
          </span>
        </div>
        <input
          id="opacity-slider"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={settings.opacity}
          onChange={(e) => onSettingChange('opacity', parseFloat(e.target.value))}
          className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          aria-label={`Opacity: ${Math.round(settings.opacity * 100)}%`}
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>0%</span>
          <span>100%</span>
        </div>
      </div>
      
      {/* Scale Slider */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <label htmlFor="scale-slider" className="text-white text-sm">
            Scale
          </label>
          <span className="text-white text-sm font-medium">
            {settings.scale.toFixed(1)}×
          </span>
        </div>
        <input
          id="scale-slider"
          type="range"
          min="0.1"
          max="3"
          step="0.1"
          value={settings.scale}
          onChange={(e) => onSettingChange('scale', parseFloat(e.target.value))}
          className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          aria-label={`Scale: ${settings.scale.toFixed(1)}×`}
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>0.1×</span>
          <span>3.0×</span>
        </div>
      </div>
      
      {/* Rotation Slider */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <label htmlFor="rotation-slider" className="text-white text-sm">
            Rotation
          </label>
          <span className="text-white text-sm font-medium">
            {settings.rotation}°
          </span>
        </div>
        <input
          id="rotation-slider"
          type="range"
          min="-180"
          max="180"
          step="1"
          value={settings.rotation}
          onChange={(e) => onSettingChange('rotation', parseInt(e.target.value))}
          className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          aria-label={`Rotation: ${settings.rotation}°`}
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>-180°</span>
          <span>180°</span>
        </div>
      </div>
      
      {/* Action Buttons */}
      <div className="flex justify-between mt-6">
        {/* Reset Button */}
        {onReset && (
          <button
            onClick={onReset}
            className="bg-gray-600 text-white px-4 py-2 rounded-full flex items-center hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-900"
            aria-label="Reset settings"
          >
            <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Reset Settings
          </button>
        )}
        
        {/* Camera Switch Button */}
        <button
          onClick={onCameraSwitch}
          className="bg-indigo-600 text-white px-4 py-2 rounded-full flex items-center hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900"
          aria-label="Switch camera"
        >
          <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth="2" 
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" 
            />
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth="2" 
              d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" 
            />
          </svg>
          Switch Camera
        </button>
      </div>
    </motion.div>
  );
};

export default OverlayControls;
