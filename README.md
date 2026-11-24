# 展陈图文排版与上墙可读性预览系统

浏览器内运行的博物馆展陈排版系统：TypeScript + WebGPU + 距离场文字渲染，字体与展板方案持久化在 IndexedDB。覆盖从字体导入、图文排版、展厅三维上墙预览、可读性核查到 1:1 刻字出图的完整链路。

## 技术栈

- Vue 3（Composition API + setup）+ TypeScript + Vite 6
- WebGPU 自研渲染（无 three.js），WGSL 距离场着色
- opentype.js 解析 TTF/OTF，earcut 三角化亚克力立体字
- Tailwind CSS v4，IndexedDB 持久化，Web Worker 生成图集
- Vitest 单元测试 + CDP headless Chrome 冒烟

## 启动

```bash
pnpm install
pnpm dev        # 开发（http://127.0.0.1:5173）
pnpm build      # 类型检查 + 生产构建
pnpm preview    # 预览生产产物
pnpm test       # 单元测试（34 项）
```

> pnpm 若提示 esbuild build script 被拦截，在 `pnpm-workspace.yaml` 的 `onlyBuiltDependencies` 中已放行 esbuild。

## 六大页面

| 路由 | 页面 | 核心能力 |
| --- | --- | --- |
| `/projects` | 展览项目 | 生成 200 板演示展览、TTF/OTF 导入、缺字回退提示 |
| `/floor` | 展厅平面 | 墙面/展柜/展台 SVG 俯视图、展板挂载、标高与观众动线 |
| `/layout` | 图文排版 | SDF 画布、横竖混排、避头尾、标点挤压、中英基线对齐 |
| `/preview` | 上墙预览 | 三维展厅、四种工艺材质、亚克力厚度、射灯眩光叠加 |
| `/readability` | 可读性检查 | 逐板字高/字视角/对比度/视距/眩光，不合格跳回排版 |
| `/export` | 出图 | 1:1 SVG 刻字矢量、中英对照 CSV、0.1mm 精度验收 |

## 核心架构

### 距离场文字管线（需求 1/2/7）

- `src/font/outline.ts`：统一字形轮廓抽象，SVG 矢量导出与 SDF 光栅化共用同一份轮廓，是 0.1mm 精度的单一数据源
- `src/font/msdf.ts`：A 通道存真 SDF（保轮廓零等值线精度），RGB 存边 3 着色距离场（median 取边保尖角），空间索引加速
- `src/font/atlas_worker.ts` + `atlas_service.ts`：只对排版实际用到的字在 Worker 生成图集，元数据与像素缓存 IndexedDB，换字体仅重建受影响字体
- `src/webgpu/shaders.ts`：`fwidth` 按屏幕像素导数自适应抗锯齿；远距小字按物理模糊模型向灰块收敛，不硬撑锐利

### 排版引擎（需求 3）

`src/layout/engine.ts` + `kinsoku.ts`：横/竖混排、JIS 简化版避头尾（行首/行尾禁则）、标点挤压、英文拼音行按比例缩放并与中文基线对齐。单块异常被隔离，不中断全展排版。

### 可读性引擎（需求 6/8）

`src/readability/engine.ts`：成人 1600mm / 轮椅 1200mm 两种眼高，沿本厅动线逐板算视距、入射角、字视角（角分）、WCAG 对比度、眩光覆盖率。厅级坐标归一化解决多厅拼接的全局坐标偏移；主内容（标题/正文）决定整板结论，展品卡小字仅作近观提示。

### 眩光模型（需求 8）

`src/preview/glare.ts`：镜面反射方向与板面法线夹角求掠射角，光束角扩散为椭圆光斑，受展板物理尺寸约束，采样求文字覆盖比例并在三维预览叠加半透明区域。

### 四种上墙工艺（需求 5）

`src/webgpu/materials.ts` + `src/preview/geometry.ts`：刻字贴/UV/丝印/亚克力分别给哑光到高光的材质参数；亚克力用字形轮廓 earcut 三角拉伸，含前面、后面与侧面厚度。

## 验收指标

- **字形精度 < 0.1mm**：`src/acceptance/precision.ts` 用 2048px 高分辨率验收光栅 + 双线性亚像素零等值线提取，与同一份矢量轮廓双向比对，30mm 小字与 200mm 前言大字均达标
- **改字体后 3 秒内重算**：`src/acceptance/benchmark.ts` 五轮计时取中位，200 板实测约 20ms（远低于 3000ms 验收线）

## 演示数据

`src/demo/generator.ts` 生成 6 展厅、24 墙、200 板（含前言大墙与小字展品卡）、展柜展台、成人/轮椅动线站位、射灯。内置合成字体（`synthetic_provider.ts`）在无真实字库时跑通全管线，导入思源黑体/宋体等真实 TTF/OTF 后自动替换。

## 浏览器冒烟

`scripts/smoke.mjs` 通过 CDP 驱动 headless Chrome 验证全流程，需先 `pnpm build && pnpm preview`，并以 `--enable-unsafe-webgpu` 启动 Chrome。
