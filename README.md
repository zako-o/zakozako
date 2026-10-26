# VERSION MONITOR

**语言 / Language:** **中文** ・ [English](README_EN.md)

基于 **Cloudflare Workers** 的版本监测工具。Worker 按计划读取各渠道页面，解析安装包地址与版本号，与 KV 中的记录比较；发现新版本时写入 KV 并发送一次通知。

## 支持的渠道

| 脚本 | 渠道 | 平台 |
| --- | --- | --- |
| [`beta/beta.js`](beta/beta.js) | BETA PUBGM 体验服 | Android 32/64 位 + iOS |
| [`beta_flash/beta_flash.js`](beta_flash/beta_flash.js) | BETA PUBGM FLASH | Android + iOS |
| [`pubgm/pubgm.js`](pubgm/pubgm.js) | PUBGM 台湾版 / 全球版 / 越南版 | Android |
| [`hp/hp.js`](hp/hp.js) | 和平精英体验服 | Android + iOS |
| [`bgmi/bgmi.js`](bgmi/bgmi.js) | BGMI 印度服 | Android |

## 部署

1. 创建 KV 命名空间，绑定变量名为 `PUBG_KV`
2. 新建 Worker，粘贴对应脚本
3. 填写脚本顶部的 `BOT_TOKEN`、`CHAT_ID`、`THREAD_ID`（没有话题填 `0`）
4. 保存并部署
5. 在 Worker 的触发器里添加 Cron，例如 `*/5 * * * *`

手动触发：`beta` / `beta_flash` 访问 `/android` 或 `/ios`，其余脚本访问根路径 `/`。

## 配置项

| 字段 | 说明 |
| --- | --- |
| `BOT_TOKEN` | 机器人 Token |
| `CHAT_ID` | 目标会话 ID |
| `THREAD_ID` | 话题 ID，默认 `0`，`≤0` 时不发送该字段 |

`beta` 与 `beta_flash` 的 Android / iOS 各有一组配置，两处都要填写。

## KV 键

| 脚本 | 键 |
| --- | --- |
| beta | `pubg_exp_current_version`、`pubg_exp_32_version`、`pubg_exp_32_url`、`pubg_exp_64_version`、`pubg_exp_64_url`、`pubg_exp_apk_links`、`pubg_ios_current_version`、`pubg_ios_ipa_links` |
| beta_flash | `pubg_flash_exp_current_version`、`pubg_flash_exp_android_version`、`pubg_flash_exp_android_url`、`pubg_flash_exp_apk_links`、`pubg_flash_ios_current_version`、`pubg_flash_ios_ipa_links` |
| pubgm | `pubgm_tw_current_version`、`pubgm_tw_apk_url`、`pubgm_global_current_version`、`pubgm_global_apk_url`、`pubgm_vn_current_version`、`pubgm_vn_apk_url`、`pubgm_apk_links` |
| hp | `hpios_current_version`、`hpios_ipa_link`、`hpandroid_current_version`、`hpandroid_apk_link` |
| bgmi | `bgmi_current_version`、`bgmi_apk_link` |

## 说明

- 首次运行时 KV 为空，会通知一次当前最新版本。
- 版本号按 `.` 分段、补足 4 段后逐段比较。
- 页面结构变化时正则可能失效，需要按实际页面调整。
- 五个脚本可共用一个 KV 命名空间。

## License

[MIT](LICENSE)
