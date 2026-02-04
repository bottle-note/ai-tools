export const Stage = {
  TOPIC_SELECTION: 'TOPIC_SELECTION',
  CONTENT_WRITING: 'CONTENT_WRITING',
  FIGMA_LAYOUT: 'FIGMA_LAYOUT',
  FINAL_OUTPUT: 'FINAL_OUTPUT',
  COMPLETE: 'COMPLETE',
} as const;

export type Stage = (typeof Stage)[keyof typeof Stage];

interface Transition {
  next: Stage;
  canReject: boolean;
}

export const TRANSITIONS: Record<string, Transition> = {
  [Stage.TOPIC_SELECTION]: { next: Stage.CONTENT_WRITING, canReject: true },
  [Stage.CONTENT_WRITING]: { next: Stage.FIGMA_LAYOUT, canReject: true },
  [Stage.FIGMA_LAYOUT]: { next: Stage.FINAL_OUTPUT, canReject: true },
  [Stage.FINAL_OUTPUT]: { next: Stage.COMPLETE, canReject: false },
};

export function getNextStage(current: Stage): Stage | null {
  const transition = TRANSITIONS[current];
  return transition?.next ?? null;
}

export function canReject(stage: Stage): boolean {
  const transition = TRANSITIONS[stage];
  return transition?.canReject ?? false;
}

export function isComplete(stage: Stage): boolean {
  return stage === Stage.COMPLETE;
}
