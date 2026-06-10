import { useEffect, useState } from "react";
import type { KwsSessionSnapshot } from "../app/KwsSessionController";
import {
  cloneSettings,
  type AppSettings,
  type KeywordPreset,
} from "../app/settings";

type SettingsTab = "keywords" | "audio" | "model" | "diagnostics";

interface SettingsDrawerProps {
  open: boolean;
  snapshot: KwsSessionSnapshot;
  onClose: () => void;
  onApply: (settings: AppSettings) => string[];
}

const tabs: Array<{ id: SettingsTab; label: string }> = [
  { id: "keywords", label: "关键词" },
  { id: "audio", label: "音频输入" },
  { id: "model", label: "模型" },
  { id: "diagnostics", label: "诊断" },
];

export function SettingsDrawer({
  open,
  snapshot,
  onClose,
  onApply,
}: SettingsDrawerProps) {
  const [tab, setTab] = useState<SettingsTab>("keywords");
  const [draft, setDraft] = useState(() => cloneSettings(snapshot.settings));
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setDraft(cloneSettings(snapshot.settings));
      setErrors([]);
    }
  }, [open, snapshot.settings]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  const updateKeyword = (id: string, patch: Partial<KeywordPreset>) => {
    setDraft((current) => ({
      ...current,
      keywords: current.keywords.map((keyword) =>
        keyword.id === id ? { ...keyword, ...patch } : keyword,
      ),
    }));
  };

  const apply = () => {
    const validationErrors = onApply(draft);
    setErrors(validationErrors);
    if (validationErrors.length === 0) {
      onClose();
    }
  };

  return (
    <div className={`drawer-layer ${open ? "is-open" : ""}`} aria-hidden={!open}>
      <button className="drawer-backdrop" type="button" onClick={onClose} tabIndex={-1} />
      <aside className="settings-drawer" aria-label="专业设置" aria-modal="true">
        <div className="drawer-header">
          <div>
            <p className="eyebrow">PROFESSIONAL CONTROLS</p>
            <h2>专业设置</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭设置">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="drawer-tabs" role="tablist" aria-label="设置分类">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={tab === item.id ? "is-active" : ""}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="drawer-content">
          {tab === "keywords" && (
            <div className="settings-section">
              <div className="section-copy">
                <h3>预置唤醒词</h3>
                <p>启用需要检测的关键词，并为每个词调整阈值和路径增强。</p>
              </div>
              <div className="keyword-list">
                {draft.keywords.map((keyword) => (
                  <article className={`keyword-card ${keyword.enabled ? "is-enabled" : ""}`} key={keyword.id}>
                    <label className="keyword-toggle">
                      <input
                        type="checkbox"
                        checked={keyword.enabled}
                        onChange={(event) =>
                          updateKeyword(keyword.id, { enabled: event.target.checked })
                        }
                      />
                      <span className="toggle-track"><i /></span>
                      <span>
                        <strong>{keyword.label}</strong>
                        <small>{keyword.phrase}</small>
                      </span>
                    </label>
                    <div className="keyword-controls">
                      <RangeField
                        label="Threshold"
                        value={keyword.threshold}
                        minimum={0}
                        maximum={1}
                        step={0.01}
                        onChange={(threshold) => updateKeyword(keyword.id, { threshold })}
                      />
                      <RangeField
                        label="Boost"
                        value={keyword.boost}
                        minimum={0}
                        maximum={10}
                        step={0.1}
                        onChange={(boost) => updateKeyword(keyword.id, { boost })}
                      />
                    </div>
                  </article>
                ))}
              </div>

              <label className="setting-row switch-row">
                <span>
                  <strong>唤醒提示音</strong>
                  <small>成功检测时播放一次短提示音</small>
                </span>
                <input
                  type="checkbox"
                  checked={draft.promptSound}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, promptSound: event.target.checked }))
                  }
                />
                <span className="toggle-track"><i /></span>
              </label>
            </div>
          )}

          {tab === "audio" && (
            <div className="settings-section">
              <div className="section-copy">
                <h3>当前输入设备</h3>
                <p>浏览器实际协商的输入参数。设备选择由站点麦克风权限管理。</p>
              </div>
              <InfoGrid
                rows={[
                  ["设备", snapshot.audioSettings?.deviceId ? "默认授权设备" : "尚未启动"],
                  ["采样率", snapshot.audioDiagnostics.inputSampleRate ? `${snapshot.audioDiagnostics.inputSampleRate} Hz` : "--"],
                  ["声道", snapshot.audioSettings?.channelCount ? String(snapshot.audioSettings.channelCount) : "--"],
                  ["自动增益", formatBoolean(snapshot.audioSettings?.autoGainControl)],
                  ["降噪", formatBoolean(snapshot.audioSettings?.noiseSuppression)],
                  ["回声消除", formatBoolean(snapshot.audioSettings?.echoCancellation)],
                ]}
              />
              <div className="settings-note">
                <span>i</span>
                <p>修改浏览器的站点麦克风权限后，停止并重新开始监听即可应用。</p>
              </div>
            </div>
          )}

          {tab === "model" && (
            <div className="settings-section">
              <div className="section-copy">
                <h3>模型运行参数</h3>
                <p>关键词应用只重建检测流，不会重新下载或实例化模型。</p>
              </div>
              <InfoGrid
                rows={[
                  ["模型", snapshot.modelId ?? "--"],
                  ["版本", snapshot.modelVersion ?? "--"],
                  ["引擎", snapshot.engine.toUpperCase()],
                  ["模型采样率", `${snapshot.modelSampleRate} Hz`],
                  ["资源来源", snapshot.modelSource ?? "--"],
                ]}
              />
              <label className="number-setting">
                <span>
                  <strong>Max active paths</strong>
                  <small>保留的候选路径数量</small>
                </span>
                <input
                  type="number"
                  min="1"
                  max="16"
                  step="1"
                  value={draft.maxActivePaths}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      maxActivePaths: Number(event.target.value),
                    }))
                  }
                />
              </label>
            </div>
          )}

          {tab === "diagnostics" && (
            <div className="settings-section">
              <div className="section-copy">
                <h3>实时诊断</h3>
                <p>用于判断输入、队列和推理线程是否保持实时。</p>
              </div>
              <InfoGrid
                rows={[
                  ["推理耗时", snapshot.app.diagnostics ? `${snapshot.app.diagnostics.inferenceMs.toFixed(2)} ms` : "--"],
                  ["实时因子", snapshot.app.diagnostics ? snapshot.app.diagnostics.realtimeFactor.toFixed(3) : "--"],
                  ["KWS 队列", snapshot.app.diagnostics ? `${snapshot.app.diagnostics.queuedSamples} samples` : "--"],
                  ["音频队列", `${snapshot.audioDiagnostics.queuedSamples} samples`],
                  ["丢弃采样", String(snapshot.audioDiagnostics.droppedSamples)],
                  ["分析帧率", snapshot.audioDiagnostics.framesPerSecond ? `${snapshot.audioDiagnostics.framesPerSecond.toFixed(1)} fps` : "--"],
                ]}
              />
              <div className="diagnostic-health">
                <span className="status-dot status-dot--mint" />
                <div><strong>LOCAL PIPELINE</strong><small>所有诊断仅存在于当前会话</small></div>
              </div>
            </div>
          )}
        </div>

        <div className="drawer-footer">
          {errors.length > 0 && (
            <div className="validation-errors" role="alert">
              {errors.map((error) => <p key={error}>{error}</p>)}
            </div>
          )}
          <button className="secondary-button" type="button" onClick={onClose}>取消</button>
          <button className="primary-button" type="button" onClick={apply}>应用设置</button>
        </div>
      </aside>
    </div>
  );
}

function RangeField({
  label,
  value,
  minimum,
  maximum,
  step,
  onChange,
}: {
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="range-field">
      <span>{label}<strong>{value.toFixed(step < 0.1 ? 2 : 1)}</strong></span>
      <input
        type="range"
        min={minimum}
        max={maximum}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function InfoGrid({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="info-grid">
      {rows.map(([label, value]) => (
        <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
      ))}
    </dl>
  );
}

function formatBoolean(value: boolean | undefined): string {
  if (value === undefined) {
    return "--";
  }
  return value ? "开启" : "关闭";
}
