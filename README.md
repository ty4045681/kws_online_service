# 浏览器本地唤醒词识别

这是一个完全在浏览器本地运行的关键词唤醒（KWS）页面。页面会自动下载并校验
Zipformer KWS 模型，使用 sherpa-onnx WebAssembly 推理，并通过麦克风实时识别
唤醒词。音频、模型输入和推理结果不会上传到服务器。

项目目标运行环境：

- Windows 10/11 x64，使用 PowerShell，**不需要 WSL**。
- 常见 Linux x64/arm64 发行版；下文以 Ubuntu/Debian 为例。
- Node.js 22.x。
- 当前版本的 Chrome、Edge 或 Firefox；推荐优先使用 Chrome/Edge。

## 目录和产物

需要自行提供的模型源文件放在：

```text
model-source/kws/
├── encoder.onnx
├── decoder.onnx
├── joiner.onnx
├── tokens.txt
└── keywords.txt
```

构建过程中会生成：

```text
.toolchains/emsdk/                    # Emscripten 4.0.23，首次自动下载
third_party/sherpa-onnx/              # 固定版本的 sherpa-onnx 源码和补丁
third_party/sherpa-onnx-build/        # WASM 中间构建目录
web/public/wasm/kws/                  # 浏览器 WASM 运行时
web/public/models/kws/                # 版本化模型和 manifest
web/dist/                             # 最终静态网站
```

这些生成目录都已被 Git 忽略。把代码迁移到另一台 Windows/Linux 电脑时，建议只
复制 Git 仓库和 `model-source/kws/` 中的五个模型文件，然后在目标电脑重新执行
构建。不要跨操作系统复制 `node_modules`、`.toolchains`、`third_party` 构建目录
或 `web/dist`。

首次完整构建需要访问 GitHub、Google Storage 和 GitLab 来下载 Emscripten 及
sherpa-onnx 依赖。建议至少预留 5 GB 磁盘空间。

## Windows 完整流程

### 1. 安装基础工具

以普通 PowerShell 执行：

```powershell
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.22 -e
winget install --id Kitware.CMake -e
winget install --id Ninja-build.Ninja -e
```

安装结束后关闭并重新打开 PowerShell，然后检查：

```powershell
node --version
npm --version
git --version
cmake --version
ninja --version
```

`node --version` 必须是 `v22.x.x`。CMake 最低要求 3.15，建议使用当前稳定版本。

如果无法使用 `winget`，可从以下官方页面安装对应工具，并确保安装目录已加入
`PATH`：

- [Node.js 22](https://nodejs.org/en/download)
- [Git for Windows](https://git-scm.com/download/win)
- [CMake](https://cmake.org/download/)
- [Ninja](https://github.com/ninja-build/ninja/releases)

### 2. 使用较短的工作目录

sherpa-onnx 的依赖目录较深。建议把项目放在短路径且仅包含 ASCII 字符的位置，
例如：

```powershell
New-Item -ItemType Directory -Force C:\src | Out-Null
Set-Location C:\src
git clone <你的仓库地址> kws-online-service
Set-Location C:\src\kws-online-service
```

不建议放在 OneDrive、桌面深层目录或包含中文字符的长路径中。

如果系统仍报告路径过长，可以管理员身份打开 PowerShell，启用 Windows 长路径：

```powershell
New-ItemProperty `
  -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" `
  -Name "LongPathsEnabled" `
  -Value 1 `
  -PropertyType DWORD `
  -Force

git config --global core.longpaths true
```

修改系统长路径设置后建议重启 Windows。

### 3. 安装前端依赖

在项目根目录执行：

```powershell
npm --prefix web ci
```

### 4. 放置正式模型

创建模型源目录：

```powershell
New-Item -ItemType Directory -Force model-source\kws | Out-Null
```

将以下五个正式文件复制到 `model-source\kws\`：

```text
encoder.onnx
decoder.onnx
joiner.onnx
tokens.txt
keywords.txt
```

注意：

- 不要使用仓库中 `web/tests/fixtures/` 下的测试占位文件。
- `tokens.txt` 必须与这三个 ONNX 文件来自同一次模型导出。
- `keywords.txt` 必须使用 sherpa-onnx KWS token 格式，并与 `tokens.txt` 匹配。
- 最稳妥的做法是直接使用训练/导出流程生成并已在原生推理中验证过的
  `keywords.txt`。

### 5. 打包模型

```powershell
npm run model:package -- `
  --source "model-source/kws" `
  --model-id eva-kws `
  --model-version v1 `
  --sample-rate 16000 `
  --feature-dim 80
```

成功后应存在：

```powershell
Test-Path web\public\models\kws\model-manifest.json
```

输出应为 `True`。

如果模型实际 feature dimension 不是 80，必须把 `--feature-dim` 改成模型训练时
的真实值。当前音频链路要求采样率为 16000 Hz。

### 6. 构建 sherpa-onnx WebAssembly

```powershell
npm run sherpa:build
```

第一次执行会自动完成：

1. 下载并激活 Emscripten 4.0.23。
2. 获取固定 commit 的 sherpa-onnx 源码。
3. 应用项目中的 partial beam result 补丁。
4. 使用 CMake 和 Ninja 编译线程版 WASM。
5. 将运行时发布到 `web/public/wasm/kws/`。

第一次构建通常需要较长时间。网络中断后可直接重新运行同一条命令。

检查产物：

```powershell
Test-Path web\public\wasm\kws\sherpa-onnx-kws-module.js
Test-Path web\public\wasm\kws\sherpa-onnx-kws-module.wasm
Test-Path web\public\wasm\kws\sherpa-onnx-kws.js
Get-Content web\public\wasm\kws\build.json
```

前三项应全部输出 `True`。

### 7. 执行轻量验证

```powershell
npm test
npm --prefix web run lint
npm run build
```

`npm run build` 必须放在模型打包和 WASM 构建之后执行，因为 Vite 会把
`web/public/` 中的模型和 WASM 一起复制到最终的 `web/dist/`。

检查最终静态网站是否完整：

```powershell
Test-Path web\dist\models\kws\model-manifest.json
Test-Path web\dist\wasm\kws\sherpa-onnx-kws-module.wasm
```

两项都应输出 `True`。

### 8. 在 Windows 本机运行

开发模式：

```powershell
npm --prefix web run dev -- --host 127.0.0.1 --port 5173
```

访问：

```text
http://localhost:5173/
```

验证生产构建：

```powershell
npm --prefix web run preview -- --host 127.0.0.1 --port 4173
```

访问：

```text
http://localhost:4173/
```

`vite preview` 只用于本机验证，不应作为正式生产服务器长期运行。

## Linux 完整流程

以下命令以 Ubuntu/Debian 为例。

### 1. 安装系统依赖

```bash
sudo apt update
sudo apt install -y git cmake build-essential curl ca-certificates xz-utils
```

项目固定使用 Node.js 22。若系统尚未安装 Node.js 22，可直接安装 Node.js 官方
预编译包。以下命令支持常见 x86_64 和 arm64 Linux：

```bash
NODE_VERSION=v22.22.3

case "$(uname -m)" in
  x86_64) NODE_ARCH=x64 ;;
  aarch64|arm64) NODE_ARCH=arm64 ;;
  *) echo "Unsupported architecture: $(uname -m)"; exit 1 ;;
esac

curl -fLO "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz"
sudo tar -xJf "node-${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" \
  -C /usr/local --strip-components=1
rm "node-${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz"
```

检查环境：

```bash
node --version
npm --version
git --version
cmake --version
make --version
```

`node --version` 必须是 `v22.x.x`。

### 2. 获取代码并安装依赖

```bash
mkdir -p ~/src
cd ~/src
git clone <你的仓库地址> kws-online-service
cd kws-online-service
npm --prefix web ci
```

### 3. 放置并打包模型

```bash
mkdir -p model-source/kws
```

把正式的 `encoder.onnx`、`decoder.onnx`、`joiner.onnx`、`tokens.txt` 和
`keywords.txt` 放到 `model-source/kws/`，然后执行：

```bash
npm run model:package -- \
  --source "model-source/kws" \
  --model-id eva-kws \
  --model-version v1 \
  --sample-rate 16000 \
  --feature-dim 80
```

检查模型 manifest：

```bash
test -f web/public/models/kws/model-manifest.json && echo "model package ready"
```

### 4. 构建 WASM

```bash
npm run sherpa:build
```

Linux 下脚本使用 Emscripten 自带的编译器和系统 `make`。首次执行会下载约数 GB
的工具链和构建依赖；网络中断后可以直接重试。

检查 WASM：

```bash
test -f web/public/wasm/kws/sherpa-onnx-kws-module.js
test -f web/public/wasm/kws/sherpa-onnx-kws-module.wasm
test -f web/public/wasm/kws/sherpa-onnx-kws.js
cat web/public/wasm/kws/build.json
```

### 5. 验证并构建静态网站

```bash
npm test
npm --prefix web run lint
npm run build
```

检查最终产物：

```bash
test -f web/dist/models/kws/model-manifest.json && echo "model ready"
test -f web/dist/wasm/kws/sherpa-onnx-kws-module.wasm && echo "wasm ready"
```

### 6. 在 Linux 本机运行

开发模式：

```bash
npm --prefix web run dev -- --host 127.0.0.1 --port 5173
```

访问 `http://localhost:5173/`。

验证生产构建：

```bash
npm --prefix web run preview -- --host 127.0.0.1 --port 4173
```

访问 `http://localhost:4173/`。

## Mock 页面

如果暂时没有正式 ONNX 模型，只想查看 UI、波形高亮和状态动画，可以运行：

```text
npm run dev:mock
```

Mock 模式不会验证真实模型精度，也不会执行 sherpa-onnx 推理。正式运行不要设置
`VITE_KWS_ENGINE=mock`。

## 正式部署

最终需要部署的目录只有：

```text
web/dist/
```

### 浏览器安全要求

线程版 WebAssembly 和麦克风访问有两个强制条件：

1. 页面必须处于安全上下文。
2. 页面必须处于 cross-origin isolated 状态。

同一台电脑通过 `http://localhost:<端口>` 访问时，localhost 会被浏览器视为可信
来源，适合本机使用。通过局域网 IP、主机名或公网域名访问时，必须配置 HTTPS；
例如 `http://192.168.1.20:4173` 通常不能获取麦克风权限。

正式静态服务器必须对页面返回：

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

并确保 `.wasm` 文件使用以下 MIME 类型：

```http
Content-Type: application/wasm
```

Vite 的开发和 preview 服务器已经配置 COOP/COEP；换成 Nginx、IIS、Caddy 或
其他静态服务器时，需要自行保留这些响应头。

浏览器打开部署页面后，可在开发者工具 Console 中检查：

```javascript
window.isSecureContext
crossOriginIsolated
typeof SharedArrayBuffer
```

期望结果分别为：

```text
true
true
"function"
```

### Linux Nginx 示例

先执行 `npm run build`，再让 Nginx 指向 `web/dist`。以下片段应放入已有的 HTTPS
`server` 配置；证书配置按你的域名环境处理：

```nginx
server {
    listen 443 ssl;
    server_name kws.example.com;

    root /opt/kws-online-service/web/dist;
    index index.html;

    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.wasm$ {
        default_type application/wasm;
        try_files $uri =404;
    }
}
```

修改后执行：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Windows IIS 要求

如果使用 IIS 托管 `web/dist`：

1. 网站必须绑定 HTTPS，除非只在同机通过 localhost 使用。
2. 为 `.wasm` 添加 MIME 类型 `application/wasm`。
3. 在 HTTP Response Headers 中添加：
   `Cross-Origin-Opener-Policy: same-origin`。
4. 在 HTTP Response Headers 中添加：
   `Cross-Origin-Embedder-Policy: require-corp`。
5. 将网站物理路径指向构建后的 `web\dist`。

## 更新模型

替换模型时不要覆盖同一个版本号。推荐每次递增 `--model-version`：

```text
v1 -> v2 -> v3
```

然后重新执行：

```text
npm run model:package -- --source "model-source/kws" --model-id eva-kws --model-version v2 --sample-rate 16000 --feature-dim 80
npm run build
```

浏览器会读取新的 `model-manifest.json`，下载并校验新版本模型。旧缓存不会被误当成
新模型使用。

如果只修改前端页面，不需要重新编译 sherpa-onnx WASM；直接执行 `npm run build`
即可。如果修改了 `patches/sherpa-onnx/`、sherpa 源码版本或 Emscripten 配置，才需
重新执行 `npm run sherpa:build`。

## 常见问题

### `node --version` 不是 22

项目根 `package.json` 限定了 Node.js `>=22 <23`。切换到 Node.js 22 后，删除
`web/node_modules` 并重新运行：

```text
npm --prefix web ci
```

### Windows 报 `Ninja is required`

```powershell
winget install --id Ninja-build.Ninja -e
```

重新打开 PowerShell，确认 `ninja --version` 后再次运行 `npm run sherpa:build`。

### CMake 缓存包含旧电脑路径

项目移动目录或跨系统复制后，删除构建缓存再重建。

Windows：

```powershell
Remove-Item -Recurse -Force third_party\sherpa-onnx-build
npm run sherpa:build
```

Linux：

```bash
rm -rf third_party/sherpa-onnx-build
npm run sherpa:build
```

### sherpa-onnx checkout 与补丁不一致

`third_party/sherpa-onnx/` 是生成目录，不要在其中长期保存手工修改。删除后重新获取。

Windows：

```powershell
Remove-Item -Recurse -Force third_party\sherpa-onnx
npm run sherpa:build
```

Linux：

```bash
rm -rf third_party/sherpa-onnx
npm run sherpa:build
```

### 页面可以打开，但无法申请麦克风

检查：

- 是否使用 `localhost` 或 HTTPS。
- 浏览器站点权限中是否允许麦克风。
- 系统隐私设置是否允许浏览器访问麦克风。
- `window.isSecureContext` 是否为 `true`。

### 页面提示 SharedArrayBuffer 或 WASM thread 不可用

检查服务器是否返回 COOP/COEP，且 `crossOriginIsolated` 是否为 `true`。不要只给
HTML 添加缓存代理规则后意外覆盖这两个响应头。

### 页面加载的是 fixture 模型

这表示当前 `web/public/models/kws/` 仍是演示包。重新使用正式模型执行
`npm run model:package`，然后刷新页面；必要时在浏览器中清除该站点的 Cache
Storage。

### 修改关键词后出现 OOV 或无法创建 keyword stream

页面设置中的关键词最终仍需要能映射到 `tokens.txt`。如果模型使用 BPE、字符或
其他 token 单元，不能直接假设自然语言单词就是合法 token。应使用与训练导出流程
一致的关键词 token 序列。

## 官方参考

- [Node.js 下载](https://nodejs.org/en/download)
- [CMake 下载](https://cmake.org/download/)
- [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)
- [Vite 静态部署](https://vite.dev/guide/static-deploy.html)
- [getUserMedia 安全上下文要求](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [SharedArrayBuffer 安全要求](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)
