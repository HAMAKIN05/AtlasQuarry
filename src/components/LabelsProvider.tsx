'use client';

import { createContext, useContext } from 'react';

import { DEFAULT_LABELS, type LabelKey, type Labels } from '@/lib/labels';

/**
 * 表示名をクライアントコンポーネントへ配る。
 *
 * サーバーで DB から解決した値を (app)/layout.tsx で流し込む。クライアント側から
 * 取りに行かせると、画面が出た直後に呼び名が入れ替わってちらつく。
 */
const LabelsContext = createContext<Labels>(DEFAULT_LABELS);

export function LabelsProvider({ value, children }: { value: Labels; children: React.ReactNode }) {
  return <LabelsContext.Provider value={value}>{children}</LabelsContext.Provider>;
}

export function useLabels(): Labels {
  return useContext(LabelsContext);
}

/** `label(labels, 'task.status', task.status)` の形で引くための小物。 */
export function label(labels: Labels, prefix: string, value: string): string {
  return labels[`${prefix}.${value}` as LabelKey] ?? value;
}
