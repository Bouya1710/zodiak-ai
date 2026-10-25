# API.md — Contrat HTTP de ZODIAK AI (v1)

Toutes les routes sont préfixées `/api`, JSON sauf indication. Auth par cookie `zodiak_session` (HttpOnly, SameSite=Lax). En mode `personal`, aucune connexion n'est demandée : l'utilisateur unique est créé automatiquement et `GET /api/auth/me` renvoie toujours cet utilisateur.

## Objets

```ts
type JobKind = 't2i' | 'i2v' | 't2v' | 'upscale' | 'interpolate' | 'lipsync' | 'concat' | 'trim';
type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'canceled' | 'blocked';

interface Job {
  id: string; kind: JobKind; status: JobStatus; progress: number;   // 0..100
  prompt: string | null; negativePrompt: string | null;
  params: Record<string, unknown>;
  presetId: string | null; templateId: string | null; characterId: string | null;
  inputAssetId: string | null; audioAssetId: string | null;
  resultAssetIds: string[]; error: string | null;
  backend: string;                 // mock | comfyui | runpod | fal
  cost: number;                    // crédits débités (0 en mode personnel)
  cacheHit: boolean;
  createdAt: string; startedAt: string | null; finishedAt: string | null;
}

interface Asset {
  id: string; kind: 'image' | 'video' | 'audio'; mime: string;
  url: string; thumbUrl: string | null;   // /api/assets/:id/file, /api/assets/:id/thumb
  width: number | null; height: number | null; duration: number | null;
  title: string | null; prompt: string | null; jobId: string | null;
  favorite: boolean; origin: 'generated' | 'upload'; createdAt: string;
}

interface Character { id: string; name: string; description: string; referenceAssetId: string | null; loraName: string | null; seed: number | null; createdAt: string; }
interface User { id: string; email: string; role: 'user' | 'admin'; credits: number; }
```

## Routes

| Méthode et chemin | Corps / paramètres | Réponse |
|---|---|---|
| `GET /api/config` | — | `{ mode: 'personal'\|'multi', creditsEnabled: boolean, backend: string, registrationOpen: boolean, notices: { realFaces: string, content: string }, limits: { maxPromptLength: number, maxUploadMb: number } }` |
| `GET /api/catalog` | — | `{ models: ModelInfo[], cameraPresets: CameraPreset[], templates: Template[], sizes: {id,label,width,height}[], costs: Record<JobKind,number> }` |
| `POST /api/auth/register` | `{ email, password }` (mode multi) | `{ user }` |
| `POST /api/auth/login` | `{ email, password }` | `{ user }` |
| `POST /api/auth/logout` | — | `{ ok: true }` |
| `GET /api/auth/me` | — | `{ user }` ou 401 |
| `POST /api/jobs` | `{ kind, prompt?, negativePrompt?, params?, presetId?, templateId?, characterId?, inputAssetId?, audioAssetId?, consent? }` | 202 `{ job }` ; 422 `{ error, code: 'blocked'\|'invalid'\|'consent_required' , reason }` ; 402 `{ code: 'insufficient_credits' }` |
| `GET /api/jobs` | `?status=&kind=&limit=&cursor=` | `{ items: Job[], nextCursor: string\|null }` |
| `GET /api/jobs/:id` | — | `{ job, assets: Asset[] }` |
| `GET /api/jobs/:id/events` | SSE | événements `progress` (`{status, progress, message}`) puis `done` (`{job}`) |
| `POST /api/jobs/:id/cancel` | — | `{ job }` |
| `DELETE /api/jobs/:id` | — | `{ ok: true }` |
| `GET /api/assets` | `?kind=&favorite=1&q=&limit=&cursor=` | `{ items: Asset[], nextCursor }` |
| `POST /api/assets/upload` | multipart : `file`, `consent` (`"true"` obligatoire pour une image) | 201 `{ asset }` |
| `GET /api/assets/:id` | — | `{ asset }` |
| `GET /api/assets/:id/file` | — | flux binaire (Range supporté) |
| `GET /api/assets/:id/thumb` | — | image JPEG |
| `PATCH /api/assets/:id` | `{ favorite?, title? }` | `{ asset }` |
| `DELETE /api/assets/:id` | — | `{ ok: true }` |
| `GET /api/characters` | — | `{ items: Character[] }` |
| `POST /api/characters` | `{ name, description, referenceAssetId?, loraName?, seed? }` | 201 `{ character }` |
| `DELETE /api/characters/:id` | — | `{ ok: true }` |
| `GET /api/credits` | — | `{ balance, creditsEnabled, ledger: {id,delta,reason,jobId,createdAt}[] }` |
| `POST /api/admin/credits` | `{ userId, delta, reason }` (admin) | `{ balance }` |
| `GET /api/health` | — | `{ ok, db, storage, backend, backendReachable }` |

`ModelInfo = { id, kind: 'image'|'video'|'tool', name, license, commercial: boolean, minVramGb: number }`
`CameraPreset = { id, label, description, promptFragment, negativeFragment?: string, category: string }`
`Template = { id, label, description, kind: 'i2v'|'t2v'|'t2i', promptTemplate: string, variables: {name,label,placeholder}[], defaults: Record<string,unknown> }`

## Paramètres de génération (`params`)
- `sizeId` (ex. `square`, `landscape`, `portrait`, `cinema`), ou `width`/`height` (multiples de 16)
- `seed` (entier, aléatoire si absent), `steps`
- vidéo : `duration` (secondes, 2 à 5 en v1), `fps` (24), `draft` (booléen, 480p)
- outils : `scale` (2 ou 4) pour `upscale`, `factor` (2) pour `interpolate`, `assetIds` pour `concat`, `start`/`end` pour `trim`

## Erreurs
Format : `{ error: string, code: string, reason?: string }`. Codes : `blocked`, `invalid`, `consent_required`, `insufficient_credits`, `not_found`, `unauthorized`, `forbidden`, `rate_limited`.

## Précisions d'implémentation
- `concat` : `params.assetIds` (2 à 20 vidéos) ; `inputAssetId` est ignoré.
- `lipsync` : `inputAssetId` = vidéo, `audioAssetId` = audio ; le résultat est un **mock** (audio sans synchronisation labiale).
- Modèle de prompt : `templateId` + `params.variables` (le `prompt` est calculé côté serveur).
- `consent` est exigé sur le job quand l'entrée est un média téléversé (`origin: upload`).
- Cache : un job identique (même graine explicite, mêmes entrées) renvoie le résultat existant, `cacheHit: true`, crédits rendus.
- SAFETY_URL : `POST {url}/classify` avec les octets de l'image → `{ "nsfw": 0..1 }` ; service injoignable = résultat bloqué.

## Routes de la vitrine
- `GET /showcase/manifest.json`, `/showcase/cNN.mp4`, `/showcase/cNN.jpg` : fichiers statiques publics (en ligne : réécriture vers le bucket Supabase `showcase`).
- `POST /api/showcase-gen` (en-tête `x-showcase-token`, réservé à la maintenance) : corps `{action:'submit'|'poll'|'finish'|'manifest', clip, job, videoUrl, ids}`.
