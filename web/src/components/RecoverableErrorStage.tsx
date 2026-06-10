interface RecoverableErrorStageProps {
  code: string;
  message: string;
  onRetry: () => void;
}

export function RecoverableErrorStage({
  code,
  message,
  onRetry,
}: RecoverableErrorStageProps) {
  return (
    <section className="hero-stage error-stage glass-panel" role="alert">
      <div className="error-icon" aria-hidden="true">!</div>
      <p className="eyebrow">RECOVERABLE ERROR · {code}</p>
      <h1>暂时无法继续</h1>
      <p className="stage-description">{message}</p>
      <button className="primary-button" type="button" onClick={onRetry}>
        重新检查
      </button>
      <p className="error-help">
        页面不会要求上传模型或音频。恢复后仍在当前设备上继续运行。
      </p>
    </section>
  );
}
