/**
 * GameInfoEditor - UI component for editing game metadata
 *
 * Features:
 * - Click-to-edit inline editing for visible fields
 * - Edit mode toggle to show and edit all fields (including empty ones)
 * - Escape cancels current edit, Enter saves
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LuPencil } from 'react-icons/lu';
import { useGameTreeBoard } from '../../contexts/GameTreeContext';
import { useAIAnalysis } from '../ai/AIAnalysisOverlay';
import './GameInfoEditor.css';

// Helper function to detect and render URLs as clickable links
const renderTextWithLinks = (text: string) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);

  return parts.map((part, index) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="game-info-link"
        >
          {part}
        </a>
      );
    }
    return part;
  });
};

type EditableField =
  | 'gameName'
  | 'date'
  | 'place'
  | 'playerBlack'
  | 'rankBlack'
  | 'playerWhite'
  | 'rankWhite'
  | 'komi'
  | 'handicap'
  | 'rules'
  | 'timeControl'
  | 'result';

interface FieldConfig {
  key: EditableField;
  labelKey: string;
  placeholderKey: string;
  type?: 'text' | 'number';
  step?: string;
  min?: string;
  max?: string;
  alwaysShow?: boolean; // Always show even when empty (like Game, Black, White, Komi)
  fallbackKey?: string; // Translation key for fallback value in renderValue
  hasLinkRender?: boolean; // Whether to render value with links
}

const FIELD_CONFIG_KEYS: FieldConfig[] = [
  {
    key: 'gameName',
    labelKey: 'gameInfo.game',
    placeholderKey: 'gameInfo.untitled',
    alwaysShow: true,
    fallbackKey: 'gameInfo.untitled',
  },
  { key: 'date', labelKey: 'gameInfo.date', placeholderKey: 'gameInfo.datePlaceholder' },
  {
    key: 'place',
    labelKey: 'gameInfo.place',
    placeholderKey: 'gameInfo.placePlaceholder',
    hasLinkRender: true,
  },
  {
    key: 'playerBlack',
    labelKey: 'gameInfo.black',
    placeholderKey: 'gameInfo.black',
    alwaysShow: true,
    fallbackKey: 'gameInfo.black',
  },
  { key: 'rankBlack', labelKey: 'gameInfo.blackRank', placeholderKey: 'gameInfo.rankPlaceholder' },
  {
    key: 'playerWhite',
    labelKey: 'gameInfo.white',
    placeholderKey: 'gameInfo.white',
    alwaysShow: true,
    fallbackKey: 'gameInfo.white',
  },
  { key: 'rankWhite', labelKey: 'gameInfo.whiteRank', placeholderKey: 'gameInfo.rankPlaceholder' },
  {
    key: 'komi',
    labelKey: 'gameInfo.komi',
    placeholderKey: 'gameInfo.komiPlaceholder',
    type: 'number',
    step: '0.5',
    alwaysShow: true,
  },
  {
    key: 'handicap',
    labelKey: 'gameInfo.handicap',
    placeholderKey: 'gameInfo.handicapPlaceholder',
    type: 'number',
    min: '0',
    max: '9',
  },
  { key: 'rules', labelKey: 'gameInfo.rules', placeholderKey: 'gameInfo.rulesPlaceholder' },
  { key: 'timeControl', labelKey: 'gameInfo.time', placeholderKey: 'gameInfo.timePlaceholder' },
  { key: 'result', labelKey: 'gameInfo.result', placeholderKey: 'gameInfo.resultPlaceholder' },
];

// Hook to get game info editor state for external header actions
export const useGameInfoEditMode = () => {
  const { gameId } = useGameTreeBoard();
  const [isEditMode, setIsEditMode] = useState(false);

  // Reset edit mode when game changes
  useEffect(() => {
    setIsEditMode(false);
  }, [gameId]);

  const toggleEditMode = useCallback(() => {
    setIsEditMode(prev => !prev);
  }, []);

  return { isEditMode, setIsEditMode, toggleEditMode };
};

// Header actions component for external use
export const GameInfoHeaderActions: React.FC<{
  isEditMode: boolean;
  onToggle: () => void;
}> = ({ isEditMode, onToggle }) => {
  const { t } = useTranslation();
  return (
    <button
      className={`info-edit-button ${isEditMode ? 'active' : ''}`}
      onClick={onToggle}
      title={isEditMode ? t('gameInfo.exitEditMode') : t('gameInfo.editAllFields')}
    >
      <LuPencil size={14} />
    </button>
  );
};

interface GameInfoEditorProps {
  isEditMode?: boolean;
  onEditModeChange?: (isEditMode: boolean) => void;
}

export const GameInfoEditor: React.FC<GameInfoEditorProps> = ({
  isEditMode: externalIsEditMode,
  onEditModeChange,
}) => {
  const { t } = useTranslation();
  const { gameInfo, updateGameInfo, gameId } = useGameTreeBoard();
  const { clearAnalysisCache } = useAIAnalysis();

  // Create translated field configs
  interface TranslatedFieldConfig {
    key: EditableField;
    label: string;
    placeholder: string;
    type?: 'text' | 'number';
    step?: string;
    min?: string;
    max?: string;
    alwaysShow?: boolean;
    renderValue?: (value: string | number | undefined) => React.ReactNode;
  }

  const fieldConfigs: TranslatedFieldConfig[] = useMemo(() => {
    return FIELD_CONFIG_KEYS.map(config => ({
      key: config.key,
      label: t(config.labelKey),
      placeholder: t(config.placeholderKey),
      type: config.type,
      step: config.step,
      min: config.min,
      max: config.max,
      alwaysShow: config.alwaysShow,
      renderValue: config.fallbackKey
        ? (v: string | number | undefined) => v || <em>{t(config.fallbackKey!)}</em>
        : config.hasLinkRender
          ? (v: string | number | undefined) => (v ? renderTextWithLinks(String(v)) : null)
          : undefined,
    }));
  }, [t]);

  // Internal edit mode state (used if not controlled externally)
  const [internalIsEditMode, setInternalIsEditMode] = useState(false);

  // Use external or internal edit mode
  const isEditMode = externalIsEditMode ?? internalIsEditMode;
  const setIsEditMode = onEditModeChange ?? setInternalIsEditMode;

  // Currently editing field (for inline editing)
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Suppress unused variable warning - clearAnalysisCache is available for future use
  void clearAnalysisCache;

  // Reset edit mode when game changes (loading or creating a new game)
  useEffect(() => {
    setIsEditMode(false);
    setEditingField(null);
    setEditValue('');
  }, [gameId, setIsEditMode]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingField && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingField]);

  const getFieldValue = useCallback(
    (field: EditableField): string | number | undefined => {
      switch (field) {
        case 'gameName':
          return gameInfo.gameName;
        case 'date':
          return gameInfo.date;
        case 'place':
          return gameInfo.place;
        case 'playerBlack':
          return gameInfo.playerBlack;
        case 'rankBlack':
          return gameInfo.rankBlack;
        case 'playerWhite':
          return gameInfo.playerWhite;
        case 'rankWhite':
          return gameInfo.rankWhite;
        case 'komi':
          return gameInfo.komi;
        case 'handicap':
          return gameInfo.handicap;
        case 'rules':
          return gameInfo.rules;
        case 'timeControl':
          return gameInfo.timeControl;
        case 'result':
          return gameInfo.result;
        default:
          return undefined;
      }
    },
    [gameInfo]
  );

  const handleFieldClick = useCallback(
    (field: EditableField) => {
      const value = getFieldValue(field);
      setEditValue(value !== undefined ? String(value) : '');
      setEditingField(field);
    },
    [getFieldValue]
  );

  const saveField = useCallback(
    (field: EditableField, value: string) => {
      const trimmed = value.trim();

      // Build update object with only the changed field
      const update: Record<string, string | number | undefined> = {};

      if (field === 'komi') {
        update.komi = trimmed ? parseFloat(trimmed) : 6.5;
      } else if (field === 'handicap') {
        update.handicap = trimmed ? parseInt(trimmed, 10) : 0;
      } else {
        update[field] = trimmed || undefined;
      }

      updateGameInfo(update);
      setEditingField(null);
      setEditValue('');
    },
    [updateGameInfo]
  );

  const handleBlur = useCallback(() => {
    if (editingField) {
      saveField(editingField, editValue);
    }
  }, [editingField, editValue, saveField]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        if (editingField) {
          saveField(editingField, editValue);
        }
      } else if (e.key === 'Escape') {
        setEditingField(null);
        setEditValue('');
      }
    },
    [editingField, editValue, saveField]
  );

  const toggleEditMode = useCallback(() => {
    const newValue = !isEditMode;
    setIsEditMode(newValue);
    // Close any inline editing when toggling edit mode
    setEditingField(null);
    setEditValue('');
  }, [isEditMode, setIsEditMode]);

  const renderField = (config: TranslatedFieldConfig) => {
    const value = getFieldValue(config.key);
    const hasValue = value !== undefined && value !== '' && value !== 0;
    const isEditing = editingField === config.key;

    // In normal mode, hide empty fields (unless alwaysShow)
    // In edit mode, show all fields
    if (!isEditMode && !config.alwaysShow && !hasValue) {
      return null;
    }

    // Special handling for handicap - only show if > 0 in non-edit mode
    if (config.key === 'handicap' && !isEditMode && (!value || value === 0)) {
      return null;
    }

    // Determine display value
    let displayValue: React.ReactNode;
    if (config.renderValue) {
      displayValue = config.renderValue(value);
    } else if (config.key === 'komi') {
      displayValue = value ?? 6.5;
    } else {
      displayValue =
        value || (isEditMode ? <em className="empty-placeholder">Click to add</em> : null);
    }

    return (
      <div key={config.key} className="game-info-row">
        <strong>{config.label}:</strong>{' '}
        {isEditing ? (
          <input
            ref={inputRef}
            type={config.type || 'text'}
            step={config.step}
            min={config.min}
            max={config.max}
            className="inline-edit-input"
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            onKeyUp={e => e.stopPropagation()}
            onKeyPress={e => e.stopPropagation()}
            placeholder={config.placeholder}
          />
        ) : (
          <span
            className={`editable-field ${isEditMode ? 'edit-mode' : ''}`}
            onClick={() => handleFieldClick(config.key)}
            title="Click to edit"
          >
            {displayValue}
          </span>
        )}
      </div>
    );
  };

  // Custom rendering for combined player + rank fields
  const renderPlayerRow = (
    playerKey: 'playerBlack' | 'playerWhite',
    rankKey: 'rankBlack' | 'rankWhite',
    label: string
  ) => {
    const playerValue = getFieldValue(playerKey);
    const rankValue = getFieldValue(rankKey);
    const isEditingPlayer = editingField === playerKey;
    const isEditingRank = editingField === rankKey;
    const playerConfig = fieldConfigs.find(c => c.key === playerKey)!;
    const rankConfig = fieldConfigs.find(c => c.key === rankKey)!;

    return (
      <div key={playerKey} className="game-info-row">
        <strong>{label}:</strong>{' '}
        {isEditingPlayer ? (
          <input
            ref={inputRef}
            type="text"
            className="inline-edit-input"
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            onKeyUp={e => e.stopPropagation()}
            onKeyPress={e => e.stopPropagation()}
            placeholder={playerConfig.placeholder}
          />
        ) : (
          <span
            className={`editable-field ${isEditMode ? 'edit-mode' : ''}`}
            onClick={() => handleFieldClick(playerKey)}
            title="Click to edit name"
          >
            {playerValue || <em>{playerKey === 'playerBlack' ? 'Black' : 'White'}</em>}
          </span>
        )}
        {/* Show rank inline or as separate editable */}
        {(rankValue || isEditMode) && (
          <>
            {' '}
            {isEditingRank ? (
              <>
                (
                <input
                  ref={inputRef}
                  type="text"
                  className="inline-edit-input inline-edit-input-small"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={handleBlur}
                  onKeyDown={handleKeyDown}
                  onKeyUp={e => e.stopPropagation()}
                  onKeyPress={e => e.stopPropagation()}
                  placeholder={rankConfig.placeholder}
                />
                )
              </>
            ) : (
              <span
                className={`editable-field editable-rank ${isEditMode ? 'edit-mode' : ''}`}
                onClick={() => handleFieldClick(rankKey)}
                title="Click to edit rank"
              >
                ({rankValue || <em>rank</em>})
              </span>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="game-info-editor">
      <div className="game-info-display">
        {/* Game Name */}
        {renderField(fieldConfigs.find(c => c.key === 'gameName')!)}

        {/* Date */}
        {renderField(fieldConfigs.find(c => c.key === 'date')!)}

        {/* Place */}
        {renderField(fieldConfigs.find(c => c.key === 'place')!)}

        {/* Black Player with Rank */}
        {renderPlayerRow('playerBlack', 'rankBlack', t('gameInfo.black'))}

        {/* White Player with Rank */}
        {renderPlayerRow('playerWhite', 'rankWhite', t('gameInfo.white'))}

        {/* Komi */}
        {renderField(fieldConfigs.find(c => c.key === 'komi')!)}

        {/* Handicap */}
        {renderField(fieldConfigs.find(c => c.key === 'handicap')!)}

        {/* Rules */}
        {renderField(fieldConfigs.find(c => c.key === 'rules')!)}

        {/* Time Control */}
        {renderField(fieldConfigs.find(c => c.key === 'timeControl')!)}

        {/* Result */}
        {renderField(fieldConfigs.find(c => c.key === 'result')!)}

        {/* Edit mode hint */}
        {isEditMode && <div className="info-hint">{t('gameInfo.editHint')}</div>}
      </div>
    </div>
  );
};
