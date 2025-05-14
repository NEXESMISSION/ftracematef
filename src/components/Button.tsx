import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

type ButtonVariant = 'primary' | 'secondary' | 'orange' | 'blue';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  to?: string;
  onClick?: () => void;
  className?: string;
  icon?: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  to,
  onClick,
  className = '',
  icon
}) => {
  const getVariantClasses = (): string => {
    switch (variant) {
      case 'primary':
        return 'bg-gradient-to-r from-primary-600 to-primary-500 group-hover:from-primary-500 group-hover:to-primary-400';
      case 'secondary':
        return 'bg-dark-400 border border-primary-500/30 group-hover:bg-dark-300';
      case 'orange':
        return 'bg-gradient-to-r from-orange-600 to-orange-500 group-hover:from-orange-500 group-hover:to-orange-400';
      case 'blue':
        return 'bg-gradient-to-r from-blue-600 to-purple-600 group-hover:from-blue-500 group-hover:to-purple-500';
      default:
        return 'bg-gradient-to-r from-primary-600 to-primary-500 group-hover:from-primary-500 group-hover:to-primary-400';
    }
  };

  const getSizeClasses = (): string => {
    switch (size) {
      case 'sm':
        return 'px-4 py-2 text-sm';
      case 'md':
        return 'px-6 py-3 text-base';
      case 'lg':
        return 'px-8 py-4 text-lg';
      default:
        return 'px-6 py-3 text-base';
    }
  };

  const buttonClasses = `
    ${getSizeClasses()}
    rounded-xl
    font-medium
    relative
    overflow-hidden
    group
    ${className}
  `;

  const ButtonContent = () => (
    <>
      <span className={`absolute inset-0 ${getVariantClasses()} transition-all duration-300`}></span>
      <span className="relative text-white flex items-center justify-center gap-2 font-heading">
        {children}
        {icon}
      </span>
    </>
  );

  if (to) {
    return (
      <Link to={to}>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className={buttonClasses}
        >
          <ButtonContent />
        </motion.button>
      </Link>
    );
  }

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={buttonClasses}
      onClick={onClick}
    >
      <ButtonContent />
    </motion.button>
  );
};

export default Button;
