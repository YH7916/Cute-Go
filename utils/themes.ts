export type BoardThemeId = 'wood';
export type StoneThemeId = 'classic' | 'minimal';

export interface BoardTheme {
  id: BoardThemeId;
  name: string;
  background: string; // CSS Color or Gradient
  backgroundImage?: string; // Optional texture pattern
  backgroundSize?: string; // Size for the pattern
  lineColor: string;
  labelColor: string;
  starPointColor: string;
  borderColor: string;
}

export interface StoneTheme {
  id: StoneThemeId;
  name: string;
  blackColor: string;
  whiteColor: string;
  blackBorder: string;
  whiteBorder: string;
  filter?: string; // Optional CSS filter for texture
}

export const BOARD_THEMES: Record<BoardThemeId, BoardTheme> = {
  wood: {
    id: 'wood',
    name: '经典原木',
    background: '#e3c086',
    backgroundImage: 'radial-gradient(circle, #deb879 10%, transparent 10.5%)',
    backgroundSize: '20px 20px',
    lineColor: '#5c4033',
    labelColor: '#5c4033',
    starPointColor: '#5c4033',
    borderColor: '#e3c086'
  }
};

export const STONE_THEMES: Record<StoneThemeId, StoneTheme> = {
  classic: {
    id: 'classic',
    name: '经典黑白',
    blackColor: '#2a2a2a',
    whiteColor: '#f0f0f0',
    blackBorder: '#000000',
    whiteBorder: '#dcdcdc'
  },
  minimal: {
    id: 'minimal',
    name: '兼容模式',
    blackColor: '#2a2a2a',
    whiteColor: '#f0f0f0',
    blackBorder: '#000000',
    whiteBorder: '#dcdcdc',
    filter: 'none'
  }
};
