# 书法字体 · 来源与许可（SIL OFL 1.1）

本目录下**除印章小篆外**的书法字体，版权归各自作者所有，均以 **SIL Open Font License 1.1
（OFL-1.1，可商用、可再分发）** 发布。本文件即 OFL 要求的「随字体一同保留的版权与许可声明」。

> 印章专用小篆（`seal-zhuanshu.woff2`）不是 OFL 字体，其来源与条款见同目录 `seal-LICENSE.txt`。

## 字体清单

| 字体名 | 文件 | 来源 | 许可 | 官方链接 |
| --- | --- | --- | --- | --- |
| Ma Shan Zheng（马善政毛笔楷书） | `ma-shan-zheng-400.woff2`（页面用子集）<br>`full/ma-shan-zheng-400.woff2`（完整字体） | Google Fonts，经 @fontsource 简体子集引入 | SIL OFL 1.1 | 字体：https://fonts.google.com/specimen/Ma+Shan+Zheng<br>来源包：https://fontsource.org/fonts/ma-shan-zheng |

> **ZCOOL XiaoWei（站酷小薇体）已于 2026-09-20 移除**，理由见下方「变更记录」。
> 它同为 SIL OFL 1.1（https://fonts.google.com/specimen/ZCOOL+XiaoWei），移除后本项目不再分发，
> 因此此处不再需要保留其声明。

许可正文（OFL 1.1 全文）**不在此逐字抄录**：抄写有出错风险，且派生副本可能被误当成原始声明。
完整条款以官方文本为准：**https://openfontlicense.org/**（亦见各字体 Google Fonts 页面的
License 区块）。

## 许可要求与本项目的处理

1. **保留声明**：OFL 要求再分发字体（含子集、转换格式后的副本）时随附本版权与许可声明，
   且不得单独以「字体」名义出售。因此**本文件与字体文件必须一起提交、一起分发，不要删除**。
   本项目在「AGENTS.md · 模块备忘」与 `src/index.css` 的字体声明处都指向了本文件。
2. **保留原始字体名**：OFL 要求不得使用保留字体名（Reserved Font Name）发布改作版本。
   本项目未改动字形轮廓，`@font-face` 中的 `font-family` 亦沿用上游字体名
   （`Ma Shan Zheng`），未做任何重命名。
3. **子集化**：页面实际加载的 woff2 是用 `scripts/subset_fonts.py` 从 `full/` 的完整字体
   裁出的子集（GB2312 一级常用字 ∪ 仓内源码字符 ∪ ASCII），属于 OFL 允许的格式转换 /
   修改范畴，**未修改任何字形轮廓**；完整字体原样保留在 `full/` 以便复核与重新子集化。
   子集只裁到「GB2312 一级」是有意为之，**不要再往下裁**：`--font-deco` 也作用在用户
   自己写的笔记标题、收藏标题上（见 `NoteItem` / `ItemCard`），裁掉二级字会让用户自己的
   文字掉回系统字体，风格与页面其它标题明显不一致。
4. **不再单独提供可安装字体**：本项目只把字体打包进 Web 应用，不对外提供桌面安装包。

## 校验用指纹（SHA-256）

用于核对仓内文件与上游发布是否一致（`certutil -hashfile <文件> SHA256`）：

```
ma-shan-zheng-400.woff2       565fa0bfcf86000a4e37472735586e3c50830e3c485a94d9c4ed7f8050ef49d8
full/ma-shan-zheng-400.woff2  36b3f3924ef392b767df54bac30f283ec5b13f81606d26f3c7c8eec9ff638806
```

已移除的 ZCOOL XiaoWei（如需从上游重新取回，用下列来源与指纹核对）：

```
来源包        https://fontsource.org/fonts/zcool-xiaowei
zcool-xiaowei-400.woff2       43e7d5351c4c3f48f20b96ae9617008afc77be1a997db8d3cf87951f9d019d51
full/zcool-xiaowei-400.woff2  f943c7337ff42159a70a21555604b8ae0e40599ecb1455b5c7b219f22642cff2
```

## 变更记录

- 2026-09-19：新增本文件。此前仓内只有印章字体的 `seal-LICENSE.txt`，两个 OFL 书法字体
  缺少许可声明——不满足 OFL 的再分发要求。
- 2026-09-20：**移除 ZCOOL XiaoWei（省 929KB）**。用 fontTools 逐码位比对确认：站酷小薇与
  马善政的字形集合**完全相同**（各 3916 字形 / 3770 CJK，同为 fontsource 简体子集，
  差集为空）。而 `--font-deco-stack` 里站酷小薇排在马善政之后 —— 同一个码位上前者必然先命中，
  它没有任何一个能轮到自己出手的字符，属于**结构性不可达**的冗余。移除后页面字体总量
  2.7MB → 1.7MB，渲染逐字不变；唯一行为差异是「马善政加载失败」这条退化路径改走
  `Noto Serif SC`。
  同时评估并**否决**了「把马善政按 `unicode-range` 切成 core/rest 两片」的方案：实测
  core 634KB / rest 1066KB，两片合计 1700KB ≈ 原体积，而字体在 `vite.config.ts` 里是
  `CacheFirst` 缓存一年 —— 收益只在「设备首次访问」出现一次，代价却变成用户每写到一个
  新字范围就多一次请求，净收益为负。故保持单文件。
