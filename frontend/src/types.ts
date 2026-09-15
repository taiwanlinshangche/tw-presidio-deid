import type { createSoundtrack } from '../soundtrack.js';

export type Phase = 'boot' | 'idle' | 'processing' | 'done' | 'reading';
export type View = 'source' | 'preview';
export type DragLabel = '放開即可開啟' | '請先關閉目前文件';
export type Soundtrack = ReturnType<typeof createSoundtrack>;

export interface Entity {
  id: string; type: string; start: number; end: number; score: number;
  original: string; masked: boolean; label: string; typeLabel: string; buttons: HTMLButtonElement[];
}
export interface Group { id: string; original: string; type: string; typeLabel: string; count: number; maskedCount: number }
export interface Redaction {
  source: DocumentFragment; preview: DocumentFragment; entities: Entity[];
  get(id: string): Entity | undefined;
  toggle(id: string): void; toggleOne(id: string): void; toggleAll(id: string): void; toggleCategory(type: string): void;
  readonly groups: Group[]; readonly maskedCount: number;
  serialize(): string;
}
export interface Current { file: File; text: string; hasBom: boolean; redaction: Redaction; edited?: boolean }
export interface SetupItem { id: string; status: string; detail?: string }
export interface SetupProgress { received: number; total: number; unit?: string }
export interface SetupState { status: string; message?: string; step?: string | null; progress?: SetupProgress | null; items?: SetupItem[] }
