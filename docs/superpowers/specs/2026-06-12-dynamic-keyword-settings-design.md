# 动态关键词设置设计规格

## 1. 目标

前端不再显示写死的关键词预设，而是在模型包加载时读取该模型的 `keywords.txt`，将其中每一条关键词动态展示到设置抽屉中。用户可以启用或禁用关键词，并调整每条关键词的 boost 和 threshold；应用设置后只重建 KWS keyword stream，不重新下载或加载 ONNX 模型。

模型中的关键词默认全部启用。当前范围不提供通过 UI 新增、删除或编辑关键词 token 序列的能力，也不把设置写回服务器上的 `keywords.txt`。

## 2. 范围

本次实现包含：

- 严格解析模型包中的 sherpa-onnx `keywords.txt`。
- 根据解析结果替换前端当前的硬编码关键词预设。
- 模型加载后默认启用全部关键词。
- 在现有设置抽屉中启用或禁用关键词，并调整 boost 和 threshold。
- 将启用的关键词序列化为 sherpa-onnx 格式，通过现有 Worker 消息重建 keyword stream。
- 模型切换或重新加载时，用新模型的 `keywords.txt` 完整替换旧关键词列表。
- 为解析、序列化和控制器数据流增加自动化测试。

本次明确不包含：

- UI 新增、删除、排序或编辑关键词 token 序列。
- 将用户设置持久化到文件、浏览器存储或服务端。
- 将自然语言自动转换为模型 token。
- 修改 sherpa-onnx C++、WASM 接口或模型文件。
- 让 `maxActivePaths` 设置实际影响 sherpa-onnx；该现有缺口单独处理。

## 3. 方案选择

采用主线程控制器解析方案：`KwsSessionController` 在模型资产校验完成后、创建 KWS Worker 前解析 `keywords.txt`，然后把结构化关键词写入页面设置状态。

该方案优于以下替代方案：

- **Worker 解析并回传**：会增加初始化消息和错误回传协议，设置 UI 必须等待额外往返，且 sherpa-onnx Worker 不应承担页面设置模型的职责。
- **构建阶段生成额外 JSON**：会让 `keywords.txt` 与 JSON 存在双份事实来源，增加模型发布和一致性校验成本。

主线程解析保持单一事实来源，并复用控制器现有的模型加载和状态更新边界。

## 4. 数据模型

在 `web/src/app/keywords.ts` 中定义纯数据结构与纯函数。关键词设置项包含：

```typescript
interface KeywordPreset {
  id: string;
  label: string;
  phrase: string;
  alias?: string;
  enabled: boolean;
  threshold: number;
  boost: number;
}
```

字段含义：

- `id`：前端列表使用的稳定唯一标识。由源文件行号和规范化后的行内容共同生成，保证同一句 token 序列重复出现时仍可区分。
- `phrase`：按源文件顺序保留的 keyword token 序列，不包含 `:boost`、`#threshold` 或 `@alias`。
- `alias`：源文件中可选的 `@alias`，保存时不包含 `@`。
- `label`：用于 UI 主标题。有 alias 时显示 alias；没有 alias 时显示 phrase。
- `enabled`：模型加载后固定初始化为 `true`。
- `threshold`：源文件中的 `#threshold`；缺省为 `0.25`。
- `boost`：源文件中的 `:boost`；缺省为 `1.0`。

没有 alias 时，UI 的标题和次级 token 文本都显示 phrase。这种重复是有意行为，用于保持布局稳定并明确实际送入模型的 token 序列。

## 5. 严格解析规则

`parseKeywordsText(text)` 按行解析 UTF-8 文本：

1. 忽略空行以及只包含空白字符的行。
2. 非空行按空白字符切分字段。
3. 普通字段按原始顺序组成 keyword token 序列。
4. 以 `:` 开头的字段表示 boost；每行最多一个。
5. 以 `#` 开头的字段表示 threshold；每行最多一个。
6. 以 `@` 开头的字段表示 alias；每行最多一个。
7. 每行必须至少包含一个普通 token。
8. boost 必须是有限数值，范围为 `0` 到 `10`，包含边界。
9. threshold 必须是有限数值，范围为 `0` 到 `1`，包含边界。
10. alias 必须非空，并保持为单个 sherpa 字段；含空格的显示名称不在当前格式能力内。
11. 参数字段可以出现在行内任意位置，但序列化时统一输出规范顺序。

以下情况均为解析错误：

- 缺少普通 token。
- 同类参数重复出现。
- 参数值缺失、不是有限数值或超出范围。
- alias 为空。

解析错误必须包含源文件行号和具体原因，例如：

```text
Invalid keywords.txt at line 7: threshold must be between 0 and 1
```

解析器只负责 `keywords.txt` 的语法和参数约束。token 是否存在于模型词表继续由 sherpa-onnx 初始化流程验证，避免在前端重复实现 `tokens.txt` 的完整解析语义。

## 6. 序列化规则

`serializeEnabledKeywords(keywords)` 只输出 `enabled === true` 的条目，每条占一行，固定格式为：

```text
<phrase> :<boost> #<threshold> [@<alias>]
```

规则如下：

- phrase 中 token 的顺序保持不变。
- boost 和 threshold 固定保留两位小数。
- 原始行没有 alias 时不生成 alias。
- 原始行有 alias 时在行尾输出 `@alias`。
- 输出行顺序与当前设置列表顺序一致。
- 不输出禁用项。
- 输出文本末尾带一个换行符，非空行之间使用 `\n`。

例如：

```text
▁HELLO ▁EVA :1.00 #0.25 @hello-eva
▁HEY ▁EVA :1.40 #0.35
```

如果用户禁用了全部关键词，现有设置校验必须拒绝应用并显示“至少启用一个关键词”，不能向 Worker 发送空关键词配置。

## 7. 加载与状态数据流

模型加载链路调整为：

```text
加载并校验模型资产
  -> 解码 keywords ArrayBuffer
  -> 严格解析 keywords.txt
  -> 用解析结果替换 snapshot.settings.keywords
  -> 保留现有 promptSound 与 maxActivePaths 设置
  -> 初始化 KWS Worker
  -> 页面进入模型可用状态
```

具体约束：

- 解析发生在 `KwsSessionController.loadModels()` 内，并且早于 `initializeKwsWorker()`。
- Worker 仍接收未经前端改写的原始 keywords asset，作为模型初始配置。
- 设置状态中的关键词来自同一份已验证资产，不增加新的网络请求。
- 新模型加载成功时，旧关键词列表被完整替换；不按 id 合并，也不保留旧模型的启用状态或参数修改。
- `promptSound` 和 `maxActivePaths` 等非关键词设置在模型重新加载时保持当前值。
- 初次页面启动、模型重试以及后续模型版本切换使用同一条解析路径。

## 8. 应用设置数据流

用户在设置抽屉点击应用时：

1. 使用现有设置校验检查至少启用一个关键词，并检查参数范围。
2. 调用 `serializeEnabledKeywords()` 生成 sherpa-onnx keyword 文本。
3. 向 KWS Worker 发送现有 `rebuild-keywords` 消息。
4. Worker 使用新文本替换 keyword spotter，并创建新的 KWS stream。
5. ONNX 模型和已经加载的 WASM 运行时保持不变。
6. 控制器按现有协议立即提交设置快照，并重置页面上的 partial 匹配状态。

本次不增加 keyword 重建成功确认消息，也不把重建过程改造成事务协议。由于 UI 不能修改 token 序列，能够应用的文本只来自已通过模型初始化的原始关键词以及经过范围校验的数值参数。

设置抽屉继续使用现有关键词卡片交互：

- 开关控制 enabled。
- slider 控制 threshold。
- slider 控制 boost。
- 有 alias 时以 alias 为标题，phrase 显示在下方。
- 无 alias 时标题和下方 token 文本都显示 phrase。
- 不显示新增、删除或 token 编辑入口。

## 9. 错误处理

### 9.1 模型关键词文件无效

严格解析失败时：

- 停止本次模型初始化。
- 不创建 KWS Worker。
- 控制器进入现有模型加载失败状态。
- 错误消息包含 `keywords.txt`、准确行号和原因。
- 用户可以通过现有模型重试流程重新加载修正后的模型包。

### 9.2 sherpa-onnx 拒绝 token

如果 `keywords.txt` 语法有效，但普通 token 不存在于模型词表：

- Worker 初始化失败并返回 sherpa-onnx 的错误。
- 页面按现有 Worker 初始化错误路径展示失败。
- 不把这种错误伪装为前端语法错误。

### 9.3 运行时重建失败

应用设置导致 Worker 重建失败时，Worker 通过现有 `KEYWORD_REBUILD_FAILED` 错误消息报告失败，页面进入现有可恢复错误状态。本次不增加回滚设置或恢复旧 stream 的协议。

## 10. 组件边界

### `web/src/app/keywords.ts`

- 定义关键词数据结构。
- 解析 `keywords.txt`。
- 序列化已启用关键词。
- 不依赖 React、Worker 或浏览器存储。

### `web/src/app/settings.ts`

- 移除硬编码 Hey EVA 等关键词预设。
- 保留设置克隆和范围校验。
- 复用 `keywords.ts` 的数据结构与序列化函数，不重复实现格式规则。

### `web/src/app/KwsSessionController.ts`

- 在模型加载阶段解码并解析关键词资产。
- 用模型关键词替换当前设置中的关键词列表。
- 解析成功后才初始化 Worker。
- 应用设置时发送规范化后的关键词文本。

### `web/src/components/SettingsDrawer.tsx`

- 继续渲染关键词卡片和参数控件。
- 支持可选 alias 的显示规则。
- 不增加新增、删除或 token 编辑控件。

### KWS Worker 与 `SherpaKwsEngine`

- 初始化协议不变。
- `rebuild-keywords` 协议不变。
- 不承担 UI 数据模型解析职责。

## 11. 测试策略

### 11.1 解析器单元测试

覆盖：

- 含 boost、threshold 和 alias 的有效行。
- 参数位于不同位置时仍保留普通 token 顺序。
- 缺省 boost 为 `1.0`，缺省 threshold 为 `0.25`。
- 空行被忽略。
- 无 alias 时 label 使用 phrase。
- 重复 phrase 生成不同且稳定的 id。
- 缺 token、重复参数、空 alias、非法数值、Infinity、NaN 和越界值。
- 所有错误包含正确的源文件行号和原因。

### 11.2 序列化单元测试

覆盖：

- 只输出启用项。
- boost 和 threshold 固定为两位小数。
- token 和列表顺序保持不变。
- 有 alias 时保留 alias，无 alias 时不自动添加。
- 解析后再序列化得到语义等价的规范文本。

### 11.3 控制器测试

覆盖：

- 模型加载后设置列表来自 `keywords.txt`，且全部启用。
- 关键词列表替换时保留 promptSound 和 maxActivePaths。
- 重新加载模型时用新列表完整替换旧列表。
- 解析失败时不创建 Worker，并进入模型加载失败状态。
- 应用设置时发送只包含启用项的规范文本。
- Worker 报告 keyword 重建错误时沿用现有可恢复错误路径。

### 11.4 回归验证

运行现有前端单元测试、lint 和生产构建。该功能只修改 TypeScript/React 层，不需要重新构建 sherpa-onnx WASM。

## 12. 验收标准

- 页面加载任意合法模型包后，设置抽屉显示该模型 `keywords.txt` 中的全部关键词。
- 所有关键词首次加载时均为启用状态。
- 缺少参数的行分别使用 boost `1.0` 和 threshold `0.25`。
- alias 和 phrase 按约定显示，且无 alias 的行不会在应用后被添加 alias。
- 用户禁用关键词或修改参数并应用后，Worker 收到正确的规范化文本并重建 stream。
- 非法 `keywords.txt` 阻止模型进入可用状态，错误包含准确行号和原因。
- 设置界面没有新增、删除或编辑关键词 token 的入口。
- 现有前端测试、lint 和生产构建全部通过。
