interface TopBarProps {
  modelLabel: string;
  modelStatus: "loading" | "ready" | "error";
  promptSound: boolean;
  onOpenSettings: () => void;
}

const statusText = {
  loading: "模型准备中",
  ready: "模型可用",
  error: "模型异常",
} as const;

export function TopBar({
  modelLabel,
  modelStatus,
  promptSound,
  onOpenSettings,
}: TopBarProps) {
  return (
    <header className="topbar glass-panel">
      <div className="brand-lockup">
        <div className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div>
          <strong>EVA KWS Console</strong>
          <span>Browser wake-word workstation</span>
        </div>
      </div>

      <div className="topbar-statuses" aria-label="系统状态">
        <div className="status-pill private-pill">
          <span className="status-dot status-dot--mint" />
          <span>本地 / 私密</span>
        </div>
        <div className={`status-pill model-pill model-pill--${modelStatus}`}>
          <span className="status-dot" />
          <span>
            {statusText[modelStatus]}
            <small>{modelLabel}</small>
          </span>
        </div>
        <button
          className="icon-button settings-button"
          type="button"
          onClick={onOpenSettings}
          aria-label="打开专业设置"
          title={`专业设置 · 提示音${promptSound ? "开启" : "关闭"}`}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 15.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z" />
            <path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.02-.66-.07-.98l2.05-1.6-1.95-3.38-2.42.98a7.4 7.4 0 0 0-1.7-.98L15.05 3.5h-3.9l-.36 2.54a7.4 7.4 0 0 0-1.7.98l-2.42-.98-1.95 3.38 2.05 1.6c-.04.32-.07.65-.07.98s.02.66.07.98l-2.05 1.6 1.95 3.38 2.42-.98c.52.4 1.1.74 1.7.98l.36 2.54h3.9l.36-2.54c.6-.24 1.18-.57 1.7-.98l2.42.98 1.95-3.38-2.05-1.6Z" />
          </svg>
        </button>
      </div>
    </header>
  );
}
