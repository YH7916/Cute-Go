// Casual defaults, shared by play, review, scoring and SGF export.
export const getDefaultKomi = (boardSize: number): number => boardSize === 9 ? 3.5 : 7.5;
