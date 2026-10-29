import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type, type JsonObject, type JsonValue, type TSchema } from '@earendil-works/pi-ai';
import { isRecord, selectTeachingChoices } from './evidence';

const empty = Type.Object({}, { additionalProperties: false });
const selected = Type.Object({ ids: Type.Array(Type.String({ maxLength: 120 }), { minItems: 1, maxItems: 12 }) },
  { additionalProperties: false });
const result = (value: JsonValue) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }], details: null });

export function createCoachTools(evidence: JsonObject): AgentTool<TSchema, null>[] {
  const { engineAnalysis } = evidence;
  return [
    {
      name: 'read_position', label: '读取当前局面',
      description: '复查首轮已提供的完整当前快照，通常无需调用。boardRows自上向下，B黑/W白/.空；坐标列跳过I、行从下向上，双方不翻转。userColor是玩家，toPlay是行棋方；globalMoveNumber为双方总手数，红点是上一手。teachingRequest给出正文限额和圈点建议；正文写坐标，程序生成圈点。questionReferences提供追问所指位置，position=earlier只表示引用来自过去；事实仍查当前棋盘。conversation仅帮助理解追问。',
      parameters: empty,
      execute: async (_id, _params, signal) => { signal?.throwIfAborted(); return result(evidence); },
    },
    {
      name: 'read_teaching_choices', label: '读取指定教学依据',
      description: '按首轮teachingChoices完整id筛选已有依据，不检索新知识。refs须完整且不重复，用于标明出处，不限制措辞或要求照抄variants。可以综合当前boardRows、groups、lastAction和engineAnalysis解释，气数与提子优先用本轮规则计算结果。group是棋块，candidate是一步效果，last-action是上一手，engine是模型估计，concept/course是一般规则；课程概念不证明当前棋形，保留条件，不编造变化或因果。',
      parameters: selected,
      execute: async (_id, params, signal) => {
        signal?.throwIfAborted();
        if (!isRecord(params) || !Array.isArray(params.ids)
          || !params.ids.every((id: unknown): id is string => typeof id === 'string')) {
          throw new Error('教学引用必须是id字符串列表。');
        }
        return result(selectTeachingChoices(evidence, params.ids));
      },
    },
    {
      name: 'read_engine_analysis', label: '读取端侧引擎分析',
      description: '复查首轮engineAnalysis，缺失返回null，不会重新推理。prior是合法着法的策略先验，visits是搜索分配而非推荐分；指定点也会优先访问，顺序不代表最佳。winRateBlack统一黑方视角，未访问候选无价值估计；estimatedBlackLead为规则软估计，不是精确比分。ownership是各搜索访问节点的黑方归属平均，非每候选或当前根局面的独立地图，不能证明死活。pass是实际搜索的停着候选，不是建议认输。variation是交替落子的示例，后续不沿用首步效果；只展示最多三个关键点。仅用已有教学项表达定性结论，不报告精确胜率、目数或访问统计。',
      parameters: empty,
      execute: async (_id, _params, signal) => { signal?.throwIfAborted(); return result(engineAnalysis ?? null); },
    },
  ];
}
