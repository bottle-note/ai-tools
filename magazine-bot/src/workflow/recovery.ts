import { recordStageError, incrementRetryCount, markErrorResolved, getLatestUnresolvedError } from '../db/index.js';
import { Stage } from './machine.js';

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_CONFIGS: Record<string, RetryConfig> = {
  [Stage.TOPIC_SELECTION]: { maxRetries: 3, initialDelayMs: 1000, backoffMultiplier: 2 },
  [Stage.CONTENT_WRITING]: { maxRetries: 2, initialDelayMs: 2000, backoffMultiplier: 2 },
  [Stage.FIGMA_LAYOUT]: { maxRetries: 2, initialDelayMs: 1000, backoffMultiplier: 1.5 },
  [Stage.FINAL_OUTPUT]: { maxRetries: 2, initialDelayMs: 1000, backoffMultiplier: 1.5 },
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function executeWithRetry<T>(
  issueId: number,
  stage: Stage,
  handler: () => Promise<T>,
  onRetry?: (attempt: number, maxRetries: number, error: Error, nextDelayMs: number) => Promise<void>,
  customConfig?: Partial<RetryConfig>,
): Promise<T> {
  const config = { ...DEFAULT_CONFIGS[stage], ...customConfig };
  let lastError: Error | null = null;
  let delayMs = config.initialDelayMs;
  let errorId: number | null = null;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      const result = await handler();

      // If we had recorded an error before but now succeeded, mark it resolved
      if (errorId !== null) {
        markErrorResolved(errorId);
      }

      return result;
    } catch (error) {
      lastError = error as Error;

      // Record error on first failure
      if (attempt === 1) {
        errorId = recordStageError(issueId, stage, lastError.message);
      } else if (errorId !== null) {
        incrementRetryCount(errorId);
      }

      // If not the last attempt, wait and notify
      if (attempt < config.maxRetries) {
        if (onRetry) {
          await onRetry(attempt, config.maxRetries, lastError, delayMs);
        }

        await sleep(delayMs);
        delayMs = Math.round(delayMs * config.backoffMultiplier);
      }
    }
  }

  // All retries exhausted
  throw new Error(
    `${stage} 단계가 ${config.maxRetries}번 시도 후 실패했습니다: ${lastError?.message}`
  );
}

/**
 * Check if an issue has unresolved errors for a specific stage
 */
export function hasUnresolvedError(issueId: number, stage: Stage): boolean {
  const error = getLatestUnresolvedError(issueId, stage);
  return error !== null;
}

/**
 * Get retry info for display
 */
export function getRetryInfo(issueId: number, stage: Stage): { hasError: boolean; retryCount: number; message: string | null } {
  const error = getLatestUnresolvedError(issueId, stage);
  if (!error) {
    return { hasError: false, retryCount: 0, message: null };
  }
  return {
    hasError: true,
    retryCount: error.retry_count,
    message: error.error_message,
  };
}
