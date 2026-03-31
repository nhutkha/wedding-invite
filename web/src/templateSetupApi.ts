export interface ReplacementPair {
  from: string;
  to: string;
}

export interface TemplateEditorItem {
  id: string;
  type: 'text' | 'image';
  source: 'text' | 'img-src' | 'background-image';
  selector: string;
  nodeId: string;
  value: string;
  label: string;
}

export interface TemplateEditorApplyUpdate {
  id: string;
  value: string;
}

export interface TemplateEditorApplyReportItem {
  id: string;
  label: string;
  source: string;
  nodeId: string;
  count: number;
}

export interface TemplateEditorApplyResult {
  message: string;
  totalApplied: number;
  report: TemplateEditorApplyReportItem[];
}

export interface TemplateSetupConfig {
  strict: boolean;
  textReplacements: ReplacementPair[];
  assetReplacements: ReplacementPair[];
}

export interface TemplateSetupSnapshot {
  textCandidates: string[];
  imageCandidates: string[];
}

export interface TemplateSetupReportItem {
  section: 'textReplacements' | 'assetReplacements';
  index: number;
  from: string;
  to: string;
  count: number;
}

export interface TemplateSetupApplyResult {
  message: string;
  totalApplied: number;
  report: TemplateSetupReportItem[];
}

export interface TemplateSetupUploadResult {
  message: string;
  publicPath: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    let message = 'Yeu cau that bai.';

    try {
      const body = await response.json();
      if (typeof body?.message === 'string') {
        message = body.message;
      }
    } catch {
      // Use fallback message.
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export function fetchTemplateSetupConfig() {
  return request<TemplateSetupConfig>('/template42/setup/config');
}

export function fetchTemplateSetupSnapshot() {
  return request<TemplateSetupSnapshot>('/template42/setup/snapshot');
}

export function applyTemplateSetup(config: TemplateSetupConfig) {
  return request<TemplateSetupApplyResult>('/template42/setup/apply', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

export function resetTemplateSetup() {
  return request<{ message: string }>('/template42/setup/reset', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function fetchTemplateEditorItems() {
  const data = await request<{ items: TemplateEditorItem[] }>(
    '/template42/editor/items'
  );
  return data.items;
}

export function applyTemplateEditorUpdates(payload: {
  strict: boolean;
  updates: TemplateEditorApplyUpdate[];
}) {
  return request<TemplateEditorApplyResult>('/template42/editor/apply', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function uploadTemplateAsset(payload: {
  fileName: string;
  dataBase64: string;
  mimeType?: string;
}) {
  return request<TemplateSetupUploadResult>('/template42/setup/upload', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
