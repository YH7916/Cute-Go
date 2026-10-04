import React, { useId } from 'react';
import type { Player } from '../../types';
import { StoneFilters } from '../board/BoardDefinitions';
import { BoardStoneBody } from '../board/BoardStones';

interface RenderStoneIconProps {
    color: Player;
    stoneSkin: string;
}

export const RenderStoneIcon: React.FC<RenderStoneIconProps> = ({ color, stoneSkin }) => {
    const filterIdPrefix = `stone-icon-${useId().replace(/:/g, '')}-`;
    return (
        <div aria-hidden="true" className="w-8 h-8 flex items-center justify-center relative">
            <svg viewBox="0 0 40 40" className="w-full h-full overflow-visible">
                <defs><StoneFilters CELL_SIZE={40} filterIdPrefix={filterIdPrefix} /></defs>
                <BoardStoneBody
                    color={color}
                    stoneSkin={stoneSkin}
                    gameType="Go"
                    separatePieces
                    stones={[{ x: 0, y: 0, color, id: color }]}
                    connections={[]}
                    animatingStoneId={null}
                    boardSize={1}
                    CELL_SIZE={40}
                    GRID_PADDING={20}
                    STONE_RADIUS={18}
                    boardPixelSize={40}
                    filterIdPrefix={filterIdPrefix}
                />
            </svg>
        </div>
    );
};
