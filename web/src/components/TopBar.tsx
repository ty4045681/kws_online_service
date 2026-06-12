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
            <circle cx="12" cy="12" r="3.35" />
            <path d="M12 3.5 14.64 5.63 18.01 5.99 18.37 9.36 20.5 12 18.37 14.64 18.01 18.01 14.64 18.37 12 20.5 9.36 18.37 5.99 18.01 5.63 14.64 3.5 12 5.63 9.36 5.99 5.99 9.36 5.63Z" />
          </svg>
        </button>
      </div>
    </header>
  );
}
