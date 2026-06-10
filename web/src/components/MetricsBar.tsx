import type { AudioDiagnostics } from "../app/KwsSessionController";
import type { AppState } from "../app/state";

interface MetricsBarProps {
  diagnostics: AppState["diagnostics"];
  audio: AudioDiagnostics;
  uptimeMs: number;
  detectionCount: number;
}

function formatUptime(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function MetricsBar({
  diagnostics,
  audio,
  uptimeMs,
  detectionCount,
}: MetricsBarProps) {
  const latency = diagnostics ? `${diagnostics.inferenceMs.toFixed(1)} ms` : "-- ms";
  const sampleRate = audio.inputSampleRate
    ? `${(audio.inputSampleRate / 1000).toFixed(audio.inputSampleRate % 1000 ? 1 : 0)} kHz`
    : "-- kHz";

  return (
    <section className="metrics-bar glass-panel" aria-label="会话指标">
      <Metric label="推理延迟" value={latency} detail="INFERENCE" />
      <Metric label="监听时长" value={formatUptime(uptimeMs)} detail="SESSION" />
      <Metric label="唤醒次数" value={String(detectionCount)} detail="DETECTIONS" />
      <Metric
        label="输入采样率"
        value={sampleRate}
        detail={`DROP ${audio.droppedSamples.toLocaleString()}`}
      />
    </section>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
