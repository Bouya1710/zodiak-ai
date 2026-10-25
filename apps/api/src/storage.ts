import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export class Storage {
  root: string;
  constructor(root: string) {
    this.root = path.resolve(root);
    fs.mkdirSync(this.root, { recursive: true });
  }
  /** Chemin absolu d'une clé, avec protection contre la sortie du dossier racine. */
  resolve(key: string): string {
    const p = path.resolve(this.root, key);
    if (p !== this.root && !p.startsWith(this.root + path.sep)) throw new Error('clé de stockage invalide');
    return p;
  }
  put(key: string, data: Buffer): void {
    const p = this.resolve(key);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const tmp = `${p}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, p);
  }
  putFile(key: string, srcPath: string): void {
    const p = this.resolve(key);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.copyFileSync(srcPath, p);
  }
  exists(key: string): boolean { return fs.existsSync(this.resolve(key)); }
  size(key: string): number { return fs.statSync(this.resolve(key)).size; }
  read(key: string): Buffer { return fs.readFileSync(this.resolve(key)); }
  stream(key: string, start?: number, end?: number): fs.ReadStream {
    return fs.createReadStream(this.resolve(key), start === undefined ? undefined : { start, end });
  }
  remove(key: string | null | undefined): void {
    if (!key) return;
    try { fs.unlinkSync(this.resolve(key)); } catch { /* déjà supprimé */ }
  }
  health(): boolean {
    try { fs.accessSync(this.root, fs.constants.W_OK); return true; } catch { return false; }
  }
}
