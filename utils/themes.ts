export type BoardThemeId = 'wood' | 'realistic_wood' | 'sakura_wood';
export type StoneThemeId = 'classic' | 'skeuomorphic' | 'minimal';

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
  // [New] High-performance rendering hints
  useGradientFill?: boolean; // Use SVG gradient fills instead of filters
  useShadowLayers?: boolean; // Use manual shadow layers for 3D effect
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
  },
  realistic_wood: {
    id: 'realistic_wood',
    name: '真实榧木',
    background: '#e3c086',
    backgroundImage: 'url("/assets/board_kaya.png")',
    backgroundSize: '512px 512px', // Seamless tiling
    lineColor: '#2d1b0e', // Darker lines for better contrast against rich wood
    labelColor: '#2d1b0e',
    starPointColor: '#2d1b0e',
    borderColor: '#e3c086'
  },
  sakura_wood: {
    id: 'sakura_wood',
    name: '樱花木',
    background: '#e4bcc7',
    backgroundImage: 'radial-gradient(circle, #dcaeb9 10%, transparent 10.5%)',
    backgroundSize: '20px 20px',
    lineColor: '#62444d',
    labelColor: '#62444d',
    starPointColor: '#62444d',
    borderColor: '#e4bcc7'
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
  skeuomorphic: {
    id: 'skeuomorphic',
    name: '新拟物风格',
    blackColor: '#303030',
    whiteColor: '#e8e8e4',
    blackBorder: '#000000',
    whiteBorder: '#d0d0d0',
    filter: 'none',
    useGradientFill: false,
    useShadowLayers: true
  },
  minimal: {
    id: 'minimal',
    name: '极简风格',
    blackColor: '#1a1a1a',
    whiteColor: '#ffffff',
    blackBorder: '#1a1a1a',
    whiteBorder: '#cccccc'
  }
};
