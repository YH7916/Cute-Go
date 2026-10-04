import React from 'react';
import { ArrowRight, Play, Undo2 } from 'lucide-react';
import { GamePlayControls } from '../GamePlayControls';
import type { LearningExerciseProps } from './LearningExercise';

export function LearningControls(props: LearningExerciseProps & { responding?: boolean }) {
  const responding = props.responding ?? false;
  const demo = props.phase === 'demonstration';
  const complete = props.phase === 'feedback' && props.result?.outcome === 'success';
  const stopped = props.phase === 'feedback' && !!props.result && !complete && ['point', 'sequence', 'variation'].includes(props.kind);
  const action = !demo && !complete && props.kind === 'action' && props.onAction;
  const primary = demo || complete
    ? { label: props.continueLabel, onClick: props.onContinue, icon: <ArrowRight size={20} /> }
    : stopped ? { label: '重试', onClick: props.onRetry, icon: <Undo2 size={20} /> }
      : action ? { label: props.actionLabel ?? '选好了', onClick: action }
      : props.onDemonstrate ? { label: '示范', onClick: props.onDemonstrate, icon: <Play size={20} /> } : undefined;
  return <GamePlayControls
    undo={{ label: demo ? '上一手' : '悔棋', onClick: props.onUndo, disabled: !props.canUndo || responding }}
    primary={primary ? { ...primary, disabled: responding } : undefined}
    reset={stopped && props.onDemonstrate
      ? { label: '示范', onClick: props.onDemonstrate, icon: <Play size={20} />, disabled: responding }
      : { label: demo ? '返回练习' : '重开', onClick: demo ? props.onReturnFromDemo : props.onRetry,
        disabled: responding, ...(demo ? { icon: <Undo2 size={20} /> } : {}) }} />;
}
