/**
 * Shared form state.
 *
 * Kept out of the action modules because a "use server" file may only export
 * async functions, so a plain constant cannot live beside the actions.
 */
export interface FormState {
  status: 'idle' | 'ok' | 'error';
  message?: string;
}

export const IDLE: FormState = { status: 'idle' };
