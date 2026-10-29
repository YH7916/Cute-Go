import React from 'react';
import { ArrowRight, CornerUpLeft } from 'lucide-react';
import { GamePlayControls } from '../GamePlayControls';
import type { LearningExerciseProps } from './LearningExercise';

export function LearningControls(props: LearningExerciseProps & { responding?: boolean }) {
  const responding = props.responding ?? false;
  const demo = props.phase === 'demonstration';
  return <GamePlayControls
    undo={{ label: demo ? '上一手' : '悔棋', onClick: props.onUndo, disabled: !props.canUndo || responding }}
    primary={{ label: demo ? props.continueLabel : '下一题', onClick: demo ? props.onContinue : () => props.onNext?.(),
      icon: <ArrowRight size={20} aria-hidden="true" />, disabled: responding || (!demo && !props.onNext),
      title: demo ? undefined : '进入下一题；未作答的本题记为跳过' }}
    reset={{ label: demo ? '返回练习' : '重开', onClick: demo ? props.onReturnFromDemo : props.onRetry,
      disabled: responding, ...(demo ? { icon: <CornerUpLeft size={20} aria-hidden="true" /> } : {}) }} />;
}
