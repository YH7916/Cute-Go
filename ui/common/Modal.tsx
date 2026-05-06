import React from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  zIndex?: string;
  maxWidth?: string;
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  zIndex = 'z-50',
  maxWidth = 'max-w-sm',
  className = '',
}) => {
  if (!isOpen) return null;

  return (
    <div className={`absolute inset-0 ${zIndex} flex items-center justify-center p-4 pointer-events-auto`}>
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={`bg-[#fcf6ea] rounded-3xl p-6 w-full ${maxWidth} shadow-2xl border-[6px] border-[#5c4033] relative animate-in zoom-in duration-300 ${className}`}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
};
