import { config } from '../config.ts';
import type { Backend } from './types.ts';
import { mockBackend } from './mock.ts';
import { createComfyBackend } from './comfyui.ts';
import { createRunpodBackend, createFalBackend } from './remote.ts';

export function createBackend(id = config.backend): Backend {
  switch (id) {
    case 'mock': return mockBackend;
    case 'comfyui': return createComfyBackend();
    case 'runpod': return createRunpodBackend();
    case 'fal': return createFalBackend();
  }
}
export type { Backend, GenRequest, GenResult } from './types.ts';
export { CanceledError } from './types.ts';
