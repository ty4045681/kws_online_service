export interface KeywordPreset {
  id: string;
  label: string;
  phrase: string;
  enabled: boolean;
  threshold: number;
  boost: number;
}

export interface AppSettings {
  keywords: KeywordPreset[];
  maxActivePaths: number;
  promptSound: boolean;
}

export const defaultSettings: AppSettings = {
  keywords: [
    {
      id: "hey-eva",
      label: "Hey EVA",
      phrase: "hey eva",
      enabled: true,
      threshold: 0.25,
      boost: 2.5,
    },
    {
      id: "hello-eva",
      label: "Hello EVA",
      phrase: "hello eva",
      enabled: true,
      threshold: 0.3,
      boost: 2,
    },
    {
      id: "eva-assistant",
      label: "EVA Assistant",
      phrase: "eva assistant",
      enabled: false,
      threshold: 0.35,
      boost: 1.5,
    },
  ],
  maxActivePaths: 4,
  promptSound: true,
};

export function cloneSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    keywords: settings.keywords.map((keyword) => ({ ...keyword })),
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
  return settings.keywords
    .filter((keyword) => keyword.enabled)
    .map(
      (keyword) =>
        `${keyword.phrase.trim()} :${keyword.boost.toFixed(2)} #${keyword.threshold.toFixed(2)}`,
    )
    .join("\n");
}
