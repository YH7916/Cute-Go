import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-[#5c4033] text-[#fcf6ea] border-[#3d2b1f] hover:bg-[#3d2b1f]',
  secondary: 'bg-[#fcf6ea] text-[#5c4033] border-[#5c4033] hover:bg-[#f0e8d8]',
  danger: 'bg-red-600 text-white border-red-800 hover:bg-red-700',
  ghost: 'bg-transparent text-[#5c4033] border-transparent hover:bg-[#f0e8d8]',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  children,
  className = '',
  ...props
}) => (
  <button
    className={`font-bold rounded-xl border-2 transition-colors ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    {...props}
  >
    {children}
  </button>
);
