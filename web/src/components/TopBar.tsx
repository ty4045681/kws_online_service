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
            <path d="M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Z" />
            <path d="m19.2 13.7 1.4 1.1-1.8 3.1-1.7-.7a7.7 7.7 0 0 1-2.2 1.3l-.2 1.8h-3.6l-.3-1.8a7.7 7.7 0 0 1-2.2-1.3l-1.7.7-1.8-3.1 1.5-1.1a8 8 0 0 1 0-2.5l-1.5-1.1L7 7l1.7.7a7.7 7.7 0 0 1 2.2-1.3l.3-1.8h3.6l.2 1.8a7.7 7.7 0 0 1 2.2 1.3l1.7-.7 1.8 3.1-1.5 1.1a8 8 0 0 1 0 2.5Z" />
          </svg>
        </button>
      </div>
    </header>
  );
}
