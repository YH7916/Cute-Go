import React from 'react';
import { useTranslation } from 'react-i18next';
import './ConfirmationDialog.css';

interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  const confirmText = confirmLabel ?? t('confirm');
  const cancelText = cancelLabel ?? t('cancel');
  if (!isOpen) return null;

  return (
    <div className="confirmation-overlay">
      <div className="confirmation-dialog">
        <h2>{title}</h2>
        <p>{message}</p>
        <div className="confirmation-actions">
          <button className="cancel-button" onClick={onCancel}>
            {cancelText}
          </button>
          <button className="confirm-button" onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
