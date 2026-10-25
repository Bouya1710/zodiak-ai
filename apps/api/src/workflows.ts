import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';

export type Workflow = Record<string, { class_type: string; inputs: Record<string, any> }>;
export interface WorkflowMeta { id: string; version: number; models: string[]; minVramGb: number; status: string; requires: string[] }

export function loadWorkflow(id: string, dir = config.workflowsDir): { meta: WorkflowMeta; nodes: Workflow } {
  if (!/^[a-z0-9_]+$/.test(id)) throw new Error('identifiant de workflow invalide');
  const raw = JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8'));
  const { _meta, ...nodes } = raw;
  return { meta: _meta as WorkflowMeta, nodes: nodes as Workflow };
}

const PLACEHOLDER = /\{\{([a-z_0-9]+)\}\}/g;

/** Remplace les {{variables}} (valeur typée si la chaîne est exactement un placeholder). */
export function renderWorkflow(nodes: Workflow, vars: Record<string, string | number | boolean>): Workflow {
  const sub = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const whole = /^\{\{([a-z_0-9]+)\}\}$/.exec(v);
      if (whole) {
        if (!(whole[1]! in vars)) throw new Error(`variable de workflow manquante : ${whole[1]}`);
        return vars[whole[1]!];
      }
      return v.replace(PLACEHOLDER, (_m, k: string) => {
        if (!(k in vars)) throw new Error(`variable de workflow manquante : ${k}`);
        return String(vars[k]);
      });
    }
    if (Array.isArray(v)) return v.map(sub);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sub(x)]));
    return v;
  };
  return sub(nodes) as Workflow;
}

const MODEL_LOADERS = new Set(['CheckpointLoaderSimple', 'UNETLoader', 'UnetLoaderGGUF']);

/** Insère un LoraLoaderModelOnly entre le chargeur de modèle et les KSampler. */
export function injectLora(nodes: Workflow, loraName: string, strength = 1): Workflow {
  const out: Workflow = structuredClone(nodes);
  const loaderId = Object.keys(out).find((k) => MODEL_LOADERS.has(out[k]!.class_type));
  if (!loaderId) throw new Error('aucun chargeur de modèle pour appliquer la LoRA');
  const newId = String(Math.max(...Object.keys(out).map(Number)) + 1);
  out[newId] = { class_type: 'LoraLoaderModelOnly', inputs: { model: [loaderId, 0], lora_name: loraName, strength_model: strength } };
  for (const [id, n] of Object.entries(out)) {
    if (id === newId) continue;
    for (const [k, v] of Object.entries(n.inputs)) if (k === 'model' && Array.isArray(v) && v[0] === loaderId) n.inputs[k] = [newId, 0];
  }
  return out;
}
