/**
 * GamepadIndicator - Shows connected gamepad icons in the header
 *
 * Displays discrete gamepad icons with tooltips showing gamepad names.
 * Click to enable/disable controllers. Multiple controllers can be active.
 * Updates dynamically as gamepads connect/disconnect.
 */

import React from 'react';
import { LuGamepad2 } from 'react-icons/lu';
import { useGamepads, type GamepadInfo } from '../../useGamepads';
import { useGameControllerManager } from './GameControllerManager';
import './GamepadIndicator.css';

export const GamepadIndicator: React.FC = () => {
  const { gamepads } = useGamepads();
  const { isControllerActive, toggleController } = useGameControllerManager();

  if (gamepads.length === 0) {
    return null;
  }

  return (
    <div className="gamepad-indicator">
      {gamepads.map((gamepad: GamepadInfo) => {
        const isActive = isControllerActive(gamepad.index);
        return (
          <button
            key={gamepad.index}
            className={`gamepad-icon ${isActive ? 'active' : 'inactive'}`}
            onClick={() => toggleController(gamepad.index)}
            title={`${gamepad.id}\n${isActive ? 'Click to disable' : 'Click to enable'}`}
            aria-label={`Gamepad ${gamepad.index + 1}: ${gamepad.id}. ${isActive ? 'Active' : 'Inactive'}. Click to ${isActive ? 'disable' : 'enable'}.`}
          >
            <LuGamepad2 size={18} />
          </button>
        );
      })}
    </div>
  );
};
