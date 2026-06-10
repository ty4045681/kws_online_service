import { useEffect, useState, useSyncExternalStore } from "react";
import { DetectionHistory } from "../components/DetectionHistory";
import { MetricsBar } from "../components/MetricsBar";
import { MicrophoneReadyStage } from "../components/MicrophoneReadyStage";
import { ModelLoadingStage } from "../components/ModelLoadingStage";
import { RecoverableErrorStage } from "../components/RecoverableErrorStage";
import { SettingsDrawer } from "../components/SettingsDrawer";
import { TopBar } from "../components/TopBar";
import { WaveformCanvas } from "../components/WaveformCanvas";
import { KwsSessionController } from "./KwsSessionController";
import type { MatchState } from "./state";

export function AppShell() {
  const [controller] = useState(() => new KwsSessionController());
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => () => controller.dispose(), [controller]);

  const modelStatus = snapshot.app.phase === "recoverable-error"
    ? "error"
    : snapshot.modelVersion
      ? "ready"
      : "loading";
  const modelLabel = snapshot.modelId && snapshot.modelVersion
    ? `${snapshot.modelId} · ${snapshot.modelVersion}`
    : "KWS package";

  return (
    <div className={`app-shell drawer-${snapshot.isSettingsOpen ? "open" : "closed"}`}>
      <div className="ambient ambient--violet" />
      <div className="ambient ambient--cyan" />
      <div className="noise-layer" />

      <div className="app-frame">
        <TopBar
          modelLabel={modelLabel}
          modelStatus={modelStatus}
          promptSound={snapshot.settings.promptSound}
          onOpenSettings={() => controller.setSettingsOpen(true)}
        />

        <main className="console-main">
          <div className="primary-column">
            {snapshot.app.phase === "loading-models" || snapshot.app.phase === "boot" ? (
              <ModelLoadingStage files={snapshot.modelFiles} />
            ) : snapshot.app.phase === "recoverable-error" && snapshot.app.lastError ? (
              <RecoverableErrorStage
                code={snapshot.app.lastError.code}
                message={snapshot.app.lastError.message}
                onRetry={() => void controller.retry()}
              />
            ) : snapshot.app.phase === "listening" ? (
              <ListeningStage
                match={snapshot.app.match}
                activeKeywords={snapshot.settings.keywords
                  .filter((keyword) => keyword.enabled)
                  .map((keyword) => keyword.label)}
                history={snapshot.waveHistory}
                onStop={() => void controller.stopListening()}
              />
            ) : (
              <MicrophoneReadyStage
                requesting={snapshot.app.phase === "requesting-permission"}
                stopped={snapshot.app.phase === "stopped"}
                onStart={() => void controller.startListening()}
              />
            )}

            <MetricsBar
              diagnostics={snapshot.app.diagnostics}
              audio={snapshot.audioDiagnostics}
              uptimeMs={snapshot.uptimeMs}
              detectionCount={snapshot.detectionCount}
            />
          </div>

          <DetectionHistory records={snapshot.detectionHistory} />
        </main>

        <footer className="console-footer">
          <span>EVA KWS · LOCAL BROWSER RUNTIME</span>
          <span>音频不会离开此设备</span>
        </footer>
      </div>

      <SettingsDrawer
        open={snapshot.isSettingsOpen}
        snapshot={snapshot}
        onClose={() => controller.setSettingsOpen(false)}
        onApply={(settings) => controller.applySettings(settings)}
      />
    </div>
  );
}

function ListeningStage({
  match,
  activeKeywords,
  history,
  onStop,
}: {
  match: MatchState;
  activeKeywords: string[];
  history: ReturnType<KwsSessionController["getSnapshot"]>["waveHistory"];
  onStop: () => void;
}) {
  const presentation = matchPresentation(match, activeKeywords);
  return (
    <section className={`listening-stage glass-panel match-${match.kind}`} aria-live="polite">
      <div className="listening-head">
        <div className="live-indicator"><span />本地麦克风监听中</div>
        <button className="stop-button" type="button" onClick={onStop}>
          <i /> 停止监听
        </button>
      </div>

      <div className="match-summary">
        <p className="eyebrow">{presentation.eyebrow}</p>
        <h1>{presentation.title}</h1>
        <div className="keyword-display">{presentation.keyword}</div>
        <p>{presentation.detail}</p>
      </div>

      <WaveformCanvas history={history} label={`${presentation.title}的实时彩虹波形`} />

      <div className="listening-footer">
        <span><i className="legend-dot legend-dot--idle" />环境音频</span>
        <span><i className="legend-dot legend-dot--partial" />匹配范围</span>
        <span><i className="legend-dot legend-dot--expired" />已过期</span>
        <strong>{activeKeywords.length} 个关键词已启用</strong>
      </div>
    </section>
  );
}

function matchPresentation(match: MatchState, activeKeywords: string[]) {
  switch (match.kind) {
    case "partial": {
      const phrase = match.keyword.split(/\s+/);
      return {
        eyebrow: "PARTIAL KEYWORD MATCH",
        title: "匹配中",
        keyword: (
          <>
            {phrase.map((word, index) => (
              <span className={index < match.matchedTokenCount ? "is-matched" : ""} key={`${word}-${index}`}>
                {word}{index < phrase.length - 1 ? " " : ""}
              </span>
            ))}
          </>
        ),
        detail: `已匹配 ${match.matchedTokenCount} / ${match.keywordTokenCount} · 候选路径仍然存活`,
      };
    }
    case "expired":
      return {
        eyebrow: "MATCH PATH EXPIRED",
        title: "匹配已过期",
        keyword: <span className="is-expired">候选路径已释放</span>,
        detail: "未完成的匹配已明显退色，监听仍在继续。",
      };
    case "detected":
      return {
        eyebrow: "WAKE WORD DETECTED",
        title: "已唤醒",
        keyword: <span className="is-detected">{match.keyword}</span>,
        detail: `完整匹配 · ${match.startTime.toFixed(2)}–${match.endTime.toFixed(2)} 秒`,
      };
    case "idle":
      return {
        eyebrow: "LIVE AUDIO ANALYSIS",
        title: "正在聆听",
        keyword: <span>{activeKeywords.join(" · ") || "EVA"}</span>,
        detail: "等待唤醒词，波形高度表示响度，颜色表示频谱质心。",
      };
  }
}
