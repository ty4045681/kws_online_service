import { modelAssetNames, type ModelAssetName } from "../model/manifest";
import type { ModelFileProgress } from "../app/KwsSessionController";

interface ModelLoadingStageProps {
  files: Readonly<Record<ModelAssetName, ModelFileProgress>>;
}

const assetLabels: Record<ModelAssetName, string> = {
  encoder: "encoder.onnx",
  decoder: "decoder.onnx",
  joiner: "joiner.onnx",
  tokens: "tokens.txt",
  keywords: "keywords.txt",
};

function progressValue(file: ModelFileProgress): number {
  if (file.total <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((file.loaded / file.total) * 100));
}

export function ModelLoadingStage({ files }: ModelLoadingStageProps) {
  const percentages = modelAssetNames.map((name) => progressValue(files[name]));
  const overall = Math.round(
    percentages.reduce((sum, value) => sum + value, 0) / modelAssetNames.length,
  );

  return (
    <section className="hero-stage loading-stage glass-panel" aria-live="polite">
      <div className="stage-glow stage-glow--violet" />
      <div className="engine-orb" aria-hidden="true">
        <span>WASM</span>
        <i />
      </div>
      <p className="eyebrow">LOCAL AI ENGINE</p>
      <h1>正在准备唤醒引擎</h1>
      <p className="stage-description">
        正在下载并校验浏览器本地模型。所有推理数据只保留在当前设备。
      </p>

      <div className="overall-progress" aria-label={`模型加载 ${overall}%`}>
        <div className="progress-track">
          <span style={{ width: `${overall}%` }} />
        </div>
        <strong>{overall}%</strong>
      </div>

      <div className="asset-progress-grid">
        {modelAssetNames.map((name) => {
          const file = files[name];
          const percent = progressValue(file);
          return (
            <div className="asset-progress-row" key={name}>
              <span className={`asset-check ${file.complete ? "is-complete" : ""}`}>
                {file.complete ? "✓" : "·"}
              </span>
              <div>
                <div className="asset-progress-meta">
                  <span>{assetLabels[name]}</span>
                  <small>{file.phase === "verify" ? "校验" : "下载"}</small>
                </div>
                <div className="progress-track progress-track--small">
                  <span style={{ width: `${percent}%` }} />
                </div>
              </div>
              <strong>{percent}%</strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}
