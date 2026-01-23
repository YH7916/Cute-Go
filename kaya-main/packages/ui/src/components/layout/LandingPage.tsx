import React from 'react';
import { useTranslation } from 'react-i18next';
import { LuPlay, LuFolderOpen, LuLibrary } from 'react-icons/lu';
import { AppDropZone } from '../file/AppDropZone';
import './LandingPage.css';

export interface LandingPageProps {
  onNewGame: () => void;
  onContinue?: () => void;
  onOpenLibrary: () => void;
  onFileDrop: (file: File) => void;
  version?: string;
  hasSavedGame?: boolean;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onNewGame,
  onContinue,
  onOpenLibrary,
  onFileDrop,
  version,
  hasSavedGame,
}) => {
  const { t } = useTranslation();

  return (
    <AppDropZone onFileDrop={onFileDrop}>
      <div className="landing-page">
        <div className="landing-content">
          <h1 className="landing-title">Kaya</h1>
          <p className="landing-subtitle">{t('landing.tagline')}</p>

          <div className="landing-actions">
            {hasSavedGame && onContinue ? (
              <>
                <button className="landing-button primary" onClick={onContinue}>
                  <LuPlay size={24} />
                  <span>{t('landing.continue')}</span>
                </button>
                <button className="landing-button secondary" onClick={onNewGame}>
                  <LuPlay size={24} />
                  <span>{t('landing.newGame')}</span>
                </button>
              </>
            ) : (
              <button className="landing-button primary" onClick={onNewGame}>
                <LuPlay size={24} />
                <span>{t('landing.newGame')}</span>
              </button>
            )}

            <button className="landing-button secondary" onClick={onOpenLibrary}>
              <LuLibrary size={24} />
              <span>{t('landing.library')}</span>
            </button>

            <div className="landing-drop-text">
              <LuFolderOpen size={16} />
              <span>{t('landing.dropSgfToOpen')}</span>
            </div>
          </div>

          <div className="landing-footer">v{version || '0.0.0'}</div>
        </div>
      </div>
    </AppDropZone>
  );
};
