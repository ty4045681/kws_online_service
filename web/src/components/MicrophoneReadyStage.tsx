import microphoneImage from "../assets/professional-monitoring-microphone.png";

interface MicrophoneReadyStageProps {
  requesting: boolean;
  stopped: boolean;
  onStart: () => void;
}

export function MicrophoneReadyStage({
  requesting,
  stopped,
  onStart,
}: MicrophoneReadyStageProps) {
  return (
    <section className="hero-stage microphone-stage glass-panel">
      <div className="stage-glow stage-glow--cyan" />
      <div className="microphone-visual">
        <div className="microphone-halo" />
        <img src={microphoneImage} alt="专业监听麦克风" />
        <span className="studio-badge">
          <i /> STUDIO INPUT
        </span>
      </div>

      <p className="eyebrow">MICROPHONE READY</p>
      <h1>{requesting ? "正在请求麦克风权限" : "准备好聆听"}</h1>
      <p className="stage-description">
        音频仅在当前浏览器中处理，不会上传、录制或持久化。
      </p>
      <button
        className="primary-button"
        type="button"
        onClick={onStart}
        disabled={requesting}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="8" y="3" width="8" height="13" rx="4" />
          <path d="M5 11.5a7 7 0 0 0 14 0M12 18.5V22M8.5 22h7" />
        </svg>
        {requesting ? "等待浏览器授权…" : stopped ? "继续监听" : "开始监听"}
      </button>
      <div className="privacy-note">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 10V8a5 5 0 0 1 10 0v2M6 10h12v10H6z" />
        </svg>
        HTTPS / localhost · Local inference only
      </div>
    </section>
  );
}
