import React from 'react';

interface ToastProps {
  message: string | null;
}

export const Toast: React.FC<ToastProps> = ({ message }) => {
  if (!message) return null;

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[80] bg-[#5c4033] text-[#fcf6ea] px-4 py-2 rounded-full text-xs font-bold shadow-lg border-2 border-[#8c6b38] animate-in fade-in">
      {message}
    </div>
  );
};
