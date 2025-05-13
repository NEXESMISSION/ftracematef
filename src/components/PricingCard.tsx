import React from 'react';
import { Link } from 'react-router-dom';

interface PricingFeature {
  text: string;
  included: boolean;
}

interface PricingCardProps {
  title: string;
  price: string;
  description: string;
  features: PricingFeature[];
  ctaText: string;
  ctaLink: string;
  highlighted?: boolean;
  className?: string;
}

const PricingCard: React.FC<PricingCardProps> = ({
  title,
  price,
  description,
  features,
  ctaText,
  ctaLink,
  highlighted = false,
  className = '',
}) => {
  return (
    <div 
      className={`rounded-lg shadow-lg overflow-hidden ${
        highlighted 
          ? 'bg-indigo-600 text-white' 
          : 'bg-white dark:bg-gray-700'
      } ${className}`}
    >
      <div className="px-6 py-8 text-center">
        <h3 className={`text-2xl font-semibold ${
          highlighted ? 'text-white' : 'text-gray-900 dark:text-white'
        }`}>
          {title}
        </h3>
        
        <div className={`text-6xl font-bold py-4 ${
          highlighted ? 'text-white' : 'text-gray-900 dark:text-white'
        }`}>
          {price}
        </div>
        
        <p className={`text-sm mb-6 ${
          highlighted ? 'text-indigo-200' : 'text-gray-600 dark:text-gray-300'
        }`}>
          {description}
        </p>
        
        <ul className="list-none mb-6">
          {features.map((feature, index) => (
            <li 
              key={index} 
              className={`py-2 ${
                index === 0 ? '' : 'border-t'
              } ${
                highlighted ? 'border-indigo-500' : 'border-gray-200 dark:border-gray-600'
              }`}
            >
              <div className="flex items-center justify-center">
                {feature.included ? (
                  <svg 
                    className={`w-5 h-5 mr-2 ${
                      highlighted ? 'text-indigo-200' : 'text-indigo-500'
                    }`} 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M5 13l4 4L19 7" 
                    />
                  </svg>
                ) : (
                  <svg 
                    className={`w-5 h-5 mr-2 ${
                      highlighted ? 'text-indigo-300' : 'text-gray-400'
                    }`} 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M6 18L18 6M6 6l12 12" 
                    />
                  </svg>
                )}
                <span className={`${
                  highlighted 
                    ? 'text-white' 
                    : 'text-gray-700 dark:text-gray-300'
                }`}>
                  {feature.text}
                </span>
              </div>
            </li>
          ))}
        </ul>
        
        <Link 
          to={ctaLink} 
          className={`block w-full py-3 px-4 rounded-md shadow text-sm font-bold uppercase focus:outline-none focus:ring-2 focus:ring-offset-2 ${
            highlighted 
              ? 'bg-white text-indigo-600 hover:bg-indigo-50 focus:ring-white' 
              : 'bg-gray-200 text-gray-800 hover:bg-gray-300 focus:ring-indigo-500'
          }`}
        >
          {ctaText}
        </Link>
      </div>
    </div>
  );
};

export default PricingCard;
