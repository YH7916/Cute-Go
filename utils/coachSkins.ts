// Settings validation, the shop and the assistant share the same skin identity.
export const COACH_SKIN_IDS = ['chuying', 'kejie'] as const;
export type CoachSkinId = typeof COACH_SKIN_IDS[number];

interface CoachSkin {
  name: string;
  subtitle: string;
  description: string;
  assetRoot: string;
  artVersion: string;
  animation: 'sprite' | 'portrait';
}

export const COACH_SKINS: Record<CoachSkinId, CoachSkin> = {
  chuying: {
    name: '褚嬴', subtitle: '白衣棋魂', description: '执扇相伴，慢慢学棋。',
    assetRoot: 'coach/chuying/', artVersion: 'chuying-reference-1', animation: 'sprite',
  },
  kejie: {
    name: '柯洁', subtitle: '棋坛名将', description: '熟悉的眼镜短发，陪你落好每一手。',
    assetRoot: 'coach/kejie/', artVersion: 'kejie-chuying-style-2', animation: 'portrait',
  },
};

export function normalizeCoachSkin(value: unknown): CoachSkinId {
  return typeof value === 'string' && Object.hasOwn(COACH_SKINS, value) ? value as CoachSkinId : 'chuying';
}
