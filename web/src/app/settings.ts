import {
  serializeEnabledKeywords,
  type KeywordPreset,
} from "./keywords";

export type { KeywordPreset } from "./keywords";

export interface AppSettings {
  keywords: KeywordPreset[];
  maxActivePaths: number;
  promptSound: boolean;
}

export const defaultSettings: AppSettings = {
  keywords: [],
  maxActivePaths: 4,
  promptSound: true,
};

export function cloneSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    keywords: settings.keywords.map((keyword) => ({ ...keyword })),
  };
}

export function replaceSettingsKeywords(
  settings: AppSettings,
  keywords: readonly KeywordPreset[],
): AppSettings {
  return {
    ...settings,
    keywords: keywords.map((keyword) => ({ ...keyword })),
  };
}

export function validateSettings(settings: AppSettings): string[] {
  const errors: string[] = [];
  const enabledKeywords = settings.keywords.filter((keyword) => keyword.enabled);

  if (enabledKeywords.length === 0) {
    errors.push("请至少启用一个关键词");
  }

  for (const keyword of settings.keywords) {
    if (!Number.isFinite(keyword.threshold) || keyword.threshold < 0 || keyword.threshold > 1) {
      errors.push(`${keyword.label} 的阈值必须在 0 到 1 之间`);
    }
    if (!Number.isFinite(keyword.boost) || keyword.boost < 0 || keyword.boost > 10) {
      errors.push(`${keyword.label} 的增强值必须在 0 到 10 之间`);
    }
  }

  if (
    !Number.isInteger(settings.maxActivePaths) ||
    settings.maxActivePaths < 1 ||
    settings.maxActivePaths > 16
  ) {
    errors.push("最大候选路径必须是 1 到 16 之间的整数");
  }

  return errors;
}

export function settingsToKeywordsText(settings: AppSettings): string {
  return serializeEnabledKeywords(settings.keywords);
}
