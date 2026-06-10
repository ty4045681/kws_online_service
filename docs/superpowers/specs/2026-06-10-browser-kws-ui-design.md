# 浏览器本地唤醒词页面设计规格

## 1. 项目目标

构建一个桌面端优先的实时唤醒词 Web 页面。页面启动后自动获取模型清单和 Zipformer KWS 的 `encoder.onnx`、`decoder.onnx`、`joiner.onnx`、tokens 与预置关键词配置，再使用 sherpa-onnx WebAssembly 在浏览器本地推理，接收麦克风音频并实时检测唤醒词。用户不需要选择或上传任何模型文件。

首版定位为“产品体验与专业控制台融合”：默认页面简洁、沉浸且适合演示；需要调试时，通过右侧抽屉查看和修改关键词、音频、模型与诊断参数。

## 2. 范围与约束

- 运行方式：纯浏览器本地推理，音频和模型推理数据不上传服务器。
- 目标运行平台：Windows 11 与主流 x86_64 Linux 桌面发行版上的最新版 Chrome 和 Edge；按 `1440 x 900` 作为主要设计画布。macOS 只作为开发环境之一，不作为唯一兼容性基线。
- 构建与部署平台：Windows 11 和 x86_64 Linux 均必须能够完成模型打包、前端构建、测试和静态部署；Windows 支持不能依赖 WSL。
- 移动端：保证基础响应式展示，不承诺与桌面端相同的推理性能和后台行为。
- 关键词：支持预置多个关键词的启用、排序和逐词参数设置；首版不支持用户输入任意文本自动生成关键词。
- 模型：部署方将 KWS encoder、decoder、joiner ONNX 文件作为版本化静态资源发布；页面按模型清单自动下载，不提供手动上传、文件选择或拖拽模型入口，不修改模型结构。
- 浏览器安全：模型加载完成后，必须由用户点击“开始监听”才能申请麦克风权限。
- 部署环境：使用 HTTPS 或 localhost，并为页面启用跨源隔离。模型、WASM、Worker 和 AudioWorklet 脚本同源托管。
- 工具链：标准构建、模型打包和验证入口使用 Node.js 脚本与 npm scripts，路径处理使用 `node:path`，不把 Bash、POSIX 文件权限或正斜杠路径作为前提。PowerShell 和 shell 文件只能作为可选薄封装。
- 精度原则：WebAssembly 不主动降低模型精度。Native/WASM 必须使用相同模型、PCM、特征和关键词参数进行一致性回归。

## 3. 视觉方向

采用“柔光玻璃”风格：

- 深蓝色底层配合蓝紫环境光和少量青色光晕。
- 半透明玻璃面板、圆润边角、细描边和克制的内高光。
- 彩虹频谱波形是页面主要的高饱和视觉元素。
- 主要文本保持高对比度，诊断信息使用等宽小字。
- 动效强调平滑、连续和精确，不使用抖动、强烈闪烁或无意义循环动画。
- 支持 `prefers-reduced-motion`，降低扫光、缩放和背景呼吸效果。

“准备好聆听”状态使用高分辨率、透明背景的专业监听麦克风产品图。图片只做轻微上下浮动，并带柔和蓝紫投影和 `STUDIO INPUT` 标识。

## 4. 页面信息架构

采用“聚焦型主舞台”布局。

### 4.1 顶栏

- 产品名称或品牌标识。
- 当前模型状态：准备中、可用、错误。
- 当前模型名称与版本；不提供模型文件上传入口。
- 本地推理与隐私状态。
- 提示音开关。
- 打开专业设置抽屉的入口。

### 4.2 主舞台

- 当前页面状态标题。
- 当前监听关键词或部分匹配词形，例如 `hey eva`。
- 实时彩虹频谱波形。
- token 匹配进度与时间区间。
- 开始/停止监听主操作。
- 完整触发时的视觉反馈。

### 4.3 底部概览

- 最近一次推理耗时或当前延迟。
- 本次监听持续时间。
- 本次会话触发次数。
- 最近检测记录：关键词、时间、得分和触发区间。

### 4.4 专业设置抽屉

抽屉从右侧打开，背景主舞台被轻微压暗和模糊，但当前监听状态仍可辨识。

抽屉包含四个标签：

1. **关键词**：预置词启用、排序、逐词 threshold、逐词 boost score。
2. **音频输入**：麦克风设备、浏览器实际采样率、自动增益、降噪和回声消除。
3. **模型参数**：推理线程数、max active paths、num trailing blanks 和模型信息。
4. **诊断**：音频丢帧、队列深度、推理耗时、UI 帧率、WASM 版本和缓存状态。

应用关键词修改时重建 KWS stream，保留已经加载到内存的 ONNX 模型。

## 5. 波形与匹配交互

### 5.1 波形编码

- 每根窄柱表示一个短时间切片。
- 柱高表示该切片的振幅或能量。
- 柱色表示主导频率或 spectral centroid：低频为蓝紫，中频为青绿，高频为黄橙红。
- 波形使用 Canvas 绘制并持续向左滚动。
- 每个波形切片保存对应的输入 sample 区间，供 token 时间回标。

### 5.2 状态定义

#### Listening

- 未匹配波形降低亮度与饱和度，但保留频率颜色。
- 页面显示当前启用关键词和本地监听状态。

#### Partial

- 当 beam 中存在与某个关键词前缀匹配的最佳存活路径时，显示已匹配 token 和进度，例如 `1 / 2`。
- 对应 sample 区间提高亮度、饱和度并增加外发光。
- 频率颜色不可被状态色覆盖。
- 如果同一路径继续存活并新增 token，高亮区间连续向后增长。

#### Expired

- 当 partial 路径被剪枝、重置或超过有效窗口时，原高亮区间进入失效状态。
- 退色时间为 `360-450 ms`。
- 不透明度约降至 `11%-14%`，饱和度约降至 `8%-12%`，亮度约降至 `56%-62%`，移除外发光。
- 暗淡轮廓保留约 `1.5 s`，随后随历史波形自然移出。

#### Detected

- 使用最终 token timestamps 回标完整关键词区间。
- 完整区间保留彩虹频谱，并执行一次白青色扫光和轻微缩放。
- 同步播放短提示音，提示音可在设置中关闭。
- 派发浏览器事件：

```javascript
window.dispatchEvent(
  new CustomEvent("wakeword-detected", {
    detail: {
      keyword: "hey eva",
      tokens: ["HEY", "EVA"],
      tokenTimestamps: [0.42, 0.76],
      startTime: 0.42,
      endTime: 1.08,
      detectedAt: Date.now()
    }
  })
);
```

- 完整触发反馈约持续 `900 ms`，然后自然回到监听态，不阻塞下一次识别。

## 6. 页面状态机

```text
boot
  -> loading-models
  -> ready-for-microphone
  -> requesting-permission
  -> listening
       -> partial
       -> expired -> listening
       -> detected -> listening
  -> stopped

任何运行状态
  -> recoverable-error
  -> 原状态或 ready-for-microphone
```

### 6.1 模型准备

- 页面启动后自动请求固定地址 `/models/kws/model-manifest.json`，不等待用户操作。
- 根据 manifest 自动获取 encoder、decoder、joiner、tokens 和关键词文件，并分别展示真实下载与校验进度。
- 使用 Cache Storage 缓存经过 SHA-256 校验的模型资源。
- 再次访问时显示“从本地缓存恢复”，并根据 manifest 的 model ID、版本、文件大小和 SHA-256 校验缓存是否仍有效。
- manifest 版本变化时只下载新增或哈希变化的文件；新版本全部下载并校验成功后再原子切换，避免混用不同版本的模型文件。
- 下载或校验失败时保留上一份完整可用缓存；如果没有可用缓存，则停留在模型错误状态并允许重试。
- 页面和设置抽屉不提供模型上传、文件选择、文件拖拽或本地路径输入控件。

模型清单结构固定为：

```typescript
type ModelAssetName =
  | "encoder"
  | "decoder"
  | "joiner"
  | "tokens"
  | "keywords";

interface ModelAsset {
  url: string;
  size: number;
  sha256: string; // 64 位小写十六进制 SHA-256
}

interface ModelManifest {
  schemaVersion: 1;
  modelId: string;
  version: string;
  sampleRate: number;
  featureDim: number;
  files: Record<ModelAssetName, ModelAsset>;
}
```

发布流程必须从最终构建产物计算 `size` 和 `sha256`，再生成 manifest；不允许人工填写未经验证的哈希。

### 6.2 麦克风准备

- 模型就绪后展示专业监听麦克风图片、隐私说明和“开始监听”按钮。
- 用户点击后调用 `getUserMedia()`。
- 权限成功后按钮收起，波形平滑进入。

### 6.3 错误恢复

- 不使用阻断式弹窗，错误在主舞台原位展示。
- 权限拒绝：说明浏览器授权步骤，并提供“重新检查”。
- 模型加载失败：显示失败文件、网络状态和单文件重试。
- Worker 崩溃：重建 Worker；若模型缓存有效，则避免重新下载。
- 音频过载：先降低绘制成本，不能暂停音频采集或推理。
- 输入设备拔出：暂停监听、保留会话历史，允许选择新设备后恢复。

## 7. 浏览器运行架构

### 7.1 线程边界

1. **AudioWorklet**
   - 从麦克风读取 Float32 PCM。
   - 按固定帧长写入基于 SharedArrayBuffer 的单生产者、单消费者环形缓冲。
   - 不执行 FFT、推理或 UI 操作。

2. **音频分析 Worker**
   - 将 44.1 kHz 或 48 kHz 输入重采样为模型配置的采样率。首版模型采样率固定为 16 kHz，除非模型包元数据明确声明其他值。
   - 计算振幅、频谱质心和波形 sample 时间索引。
   - 向 WASM 推理 Worker 发送连续的 16 kHz Float32 PCM chunk。

3. **WASM 推理 Worker**
   - 接收经过 manifest 校验的模型资源，加载 sherpa-onnx WASM、encoder、decoder、joiner、tokens 和关键词配置。
   - 执行 KWS 解码和 partial 只读快照查询。
   - 输出 partial、expired、detected 和 diagnostics 消息。

4. **主线程**
   - 维护界面状态机。
   - 使用 `requestAnimationFrame` 绘制 Canvas 波形。
   - 派发浏览器事件和播放提示音。
   - 不执行 ONNX 推理。

模型资产由主线程中的 Model Asset Manager 管理。它负责请求 manifest、校验缓存、以最多两个并发请求下载文件、计算 SHA-256、原子切换活动版本，并将已验证的 `ArrayBuffer` 转交给 WASM 推理 Worker。页面路由和监听按钮不负责模型文件选择。

AudioWorklet 与音频分析 Worker 不通过主线程逐块转发 PCM。页面必须返回以下响应头以启用 `SharedArrayBuffer`：

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

如果部署环境无法提供跨源隔离，首版应直接显示“不支持当前部署配置”的可恢复错误，不启用一个可能丢帧的主线程转发降级路径。

### 7.2 音频设置

- 首选单声道输入。
- 请求约束中显式配置 echo cancellation、noise suppression 和 auto gain control，并展示浏览器最终实际采用的设置。
- 默认值应经过真实麦克风验证后确定，不能假设全部关闭或开启一定更好。
- sample 时间轴以 AudioWorklet 接收的连续样本计数为准，不使用 UI 墙钟推断 token 区间。

## 8. sherpa-onnx WASM 扩展

公开 KWS 结果接口可返回完整触发后的 keyword、tokens 和 token timestamps，但不保证暴露未完成的 beam 候选路径。为了支持真实 partial 高亮，使用小范围只读扩展。

### 8.1 扩展原则

- 不修改 ONNX 模型。
- 不修改 beam search 的分数、剪枝、阈值或最终触发逻辑。
- 只增加当前最佳关键词前缀路径的快照读取能力。
- 补丁保持独立、可重放，并固定 sherpa-onnx 基线版本。

### 8.2 固定接口契约

新增 C API `SherpaOnnxGetPartialKeywordResult()` 和 `SherpaOnnxDestroyPartialKeywordResult()`。结果结构固定为：

```cpp
typedef struct SherpaOnnxPartialKeywordResult {
  const char *keyword;
  const char *const *tokens_arr;
  const int32_t *frame_indexes;
  int32_t matched_token_count;
  int32_t keyword_token_count;
  uint64_t revision;
  int32_t is_active;
} SherpaOnnxPartialKeywordResult;

const SherpaOnnxPartialKeywordResult *SherpaOnnxGetPartialKeywordResult(
    const SherpaOnnxKeywordSpotter *spotter,
    const SherpaOnnxOnlineStream *stream);

void SherpaOnnxDestroyPartialKeywordResult(
    const SherpaOnnxPartialKeywordResult *result);
```

所有指针由 result 对象持有，并在调用销毁函数后失效。`tokens_arr` 和 `frame_indexes` 的有效长度为 `matched_token_count`。

WASM JS 层向应用发送：

```javascript
{
  type: "partial",
  keyword: "hey eva",
  tokens: ["HEY"],
  startSample: 6720,
  endSample: 11360,
  matchedTokenCount: 1,
  keywordTokenCount: 2,
  revision: 18
}
```

规则：

- `revision` 对同一 stream 单调递增。
- 路径改变或被剪枝时发出显式 expired 消息；stream 被重置或停止时发出显式 partial-reset 消息。UI 不靠超时猜测 beam 状态。
- 最终 detected 消息以公开 KWS result 的 tokens 和 timestamps 为准。
- 重置 stream 后清空 partial 状态。

## 9. UI 数据模型

主要消息类型：

```typescript
type WorkerMessage =
  | { type: "engine-progress"; asset: string; loaded: number; total: number }
  | { type: "engine-ready"; cached: boolean }
  | { type: "audio-frame"; startSample: number; endSample: number; amplitude: number; centroidHz: number }
  | { type: "partial"; keyword: string; tokens: string[]; startSample: number; endSample: number; matchedTokenCount: number; keywordTokenCount: number; revision: number }
  | { type: "expired"; revision: number; startSample: number; endSample: number }
  | { type: "partial-reset"; reason: "detected" | "stopped" | "stream-rebuilt" | "engine-reset" }
  | { type: "detected"; keyword: string; tokens: string[]; tokenTimestamps: number[]; startTime: number; endTime: number }
  | { type: "diagnostics"; inferenceMs: number; queueDepth: number; droppedFrames: number }
  | { type: "error"; code: string; message: string; recoverable: boolean };
```

波形环形缓冲中的每个切片至少保存：

```typescript
interface WaveSlice {
  startSample: number;
  endSample: number;
  amplitude: number;
  centroidHz: number;
  state: "idle" | "partial" | "expired" | "detected";
  revision?: number;
  stateChangedAt?: number;
}
```

## 10. 性能与降级策略

- 音频丢帧目标：`0%`。
- 正常设备 UI 目标：`60 fps`。
- final result 到 `wakeword-detected` 事件派发目标：不超过一帧，即约 `16 ms`。
- 第二次访问应优先从 Cache Storage 恢复全部模型资源。

高负载时按以下顺序降级：

1. 波形刷新从 60 fps 降至 30 fps。
2. 降低 FFT 或频谱质心计算频率，在中间帧复用颜色。
3. 关闭背景呼吸、玻璃光斑和非必要阴影。
4. 始终保留音频采集、KWS 推理、partial/expired/detected 状态和事件派发。

## 11. 测试与验收

测试策略保持精简，只自动化高风险的数据边界和一条完整主流程。视觉细节、真实麦克风效果和设备差异通过简短人工验收完成，不为每个 UI 组件、错误卡片或动画建立独立测试。

### 11.1 Native/WASM 一致性

- 使用 3 至 5 个具有代表性的 16 kHz PCM 样本：完整正例、只说前半段、近音负例、噪声正例，以及可选的连续触发样本。
- 比较触发关键词、是否触发、token 序列和触发时间。
- 触发结果必须一致；时间偏差不得超过一个解码 chunk。

### 11.2 Partial 生命周期

- 使用一个 reducer/状态机测试验证 token 新增、路径剪枝、最终触发和 stream reset。
- revision 必须单调递增。
- UI 不得留下已失效路径的高亮或把一个 revision 的区间错误延续到另一个路径。

### 11.3 音频链路

- 自动化测试只验证 PCM 环形缓冲的顺序/溢出行为和 48 kHz 到 16 kHz 的连续重采样。
- 覆盖 Windows 11 与 Linux 的内置、USB 和蓝牙麦克风；如果测试机没有蓝牙设备，必须记录该项未验证，不能以模拟测试替代硬件结论。
- 覆盖 Windows/Linux 最新版 Chrome 和 Edge。Linux 上如果 Edge 不在目标部署环境可用，至少验证 Chrome，并在发布报告中显式标记 Edge 未验证。
- 验证音频样本计数连续、重采样长度正确、无未报告丢帧。

### 11.4 跨平台构建与部署

- CI 使用 `windows-latest` 和 `ubuntu-latest` 矩阵运行 TypeScript 检查、精简单元测试、前端构建、模型清单生成与清单哈希验证。
- 路径中包含空格时，所有 Node 构建脚本仍必须工作。
- 测试 Git `core.autocrlf=true` 下的脚本和文本文件处理，关键词与 tokens 文件解析不能依赖 LF 换行。
- Windows 不依赖可执行位；所有工具通过 `node <script>` 或 `npm run <script>` 启动。
- 生产静态服务必须给出 Linux Nginx/Caddy 与 Windows IIS/Node 两类配置示例，且均返回 COOP、COEP 和正确的 WASM MIME 类型。

### 11.5 设置与恢复

- 浏览器自动化只覆盖一条主流程：自动加载模型、进入监听、显示 Partial、转为 Expired、完成 Detected，并应用一次关键词参数修改。
- 修改后只重建 stream，不重新下载或重新实例化模型，除非模型级参数确实改变。
- 模型资产单测覆盖首次自动下载、缓存命中和 SHA-256 不匹配三种情况，不建立完整故障注入矩阵。
- 权限拒绝、设备拔出、manifest 无效和 Worker 重启通过人工验收清单检查。

### 11.6 视觉与可访问性

- 人工检查 Prepare、Ready、Listening、Partial、Expired、Detected 和 Error 状态可辨识。
- 不能仅依赖颜色表达识别状态；必须同时提供文本、亮度或标签变化。
- reduced motion 模式禁用悬浮、扫光和缩放，只保留必要状态切换。

## 12. 明确不在首版范围内

- 服务端 WebSocket 推理或本地/服务端双模式。
- 用户输入任意文本并自动生成关键词 token。
- 用户手动上传、选择或拖拽 ONNX、tokens、keywords 文件。
- 移动端完整性能保证。
- 录音上传、云端日志或用户音频持久化。
- 使用并行 ASR 模型模拟 partial KWS。
- 以视觉启发式猜测模型未公开的匹配状态。

## 13. 交付结果

首版完成后，用户能够：

1. 打开页面后无需上传文件，自动获取并缓存部署方发布的模型资产，同时看到真实加载与校验状态。
2. 主动授权麦克风并开始本地监听。
3. 通过彩虹频谱波形观察实时声音。
4. 看到 beam 中真实存活的关键词 token 匹配区间。
5. 看到未完成候选明显退为 Expired。
6. 在完整触发时获得扫光、提示音和浏览器事件。
7. 在专业抽屉中管理多个预置关键词并查看运行诊断。

## 14. 技术参考

- [sherpa-onnx WASM KWS 示例](https://github.com/k2-fsa/sherpa-onnx/tree/master/wasm/kws)
- [sherpa-onnx C API](https://github.com/k2-fsa/sherpa-onnx/blob/master/sherpa-onnx/c-api/c-api.h)
- [sherpa-onnx KWS Transducer 实现](https://github.com/k2-fsa/sherpa-onnx/blob/master/sherpa-onnx/csrc/keyword-spotter-transducer-impl.h)
- [MDN: AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)
- [MDN: SharedArrayBuffer 安全要求](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer#security_requirements)
