# VERSION MONITOR

**语言 / Language:** [中文](README.md) ・ **English**

A version monitoring tool built on **Cloudflare Workers**. The Worker periodically reads each channel's page, parses package URLs and version numbers, compares them with the value stored in KV, and sends a single notification when a newer version appears.

## Supported channels

| Script | Channel | Platforms |
| --- | --- | --- |
| [`beta/beta.js`](beta/beta.js) | BETA PUBGM beta | Android 32/64-bit + iOS |
| [`beta_flash/beta_flash.js`](beta_flash/beta_flash.js) | BETA PUBGM FLASH | Android + iOS |
| [`pubgm/pubgm.js`](pubgm/pubgm.js) | PUBGM Taiwan / Global / Vietnam | Android |
| [`hp/hp.js`](hp/hp.js) | Game for Peace beta | Android + iOS |
| [`bgmi/bgmi.js`](bgmi/bgmi.js) | BGMI India | Android |

## Deployment

1. Create a KV namespace and bind it as `PUBG_KV`
2. Create a Worker and paste the script
3. Fill in `BOT_TOKEN`, `CHAT_ID`, `THREAD_ID` at the top of the script (use `0` when there is no topic)
4. Save and deploy
5. Add a Cron trigger, for example `*/5 * * * *`

Manual trigger: `beta` / `beta_flash` use `/android` or `/ios`; the other scripts use `/`.

## Configuration

| Field | Description |
| --- | --- |
| `BOT_TOKEN` | Bot token |
| `CHAT_ID` | Target chat ID |
| `THREAD_ID` | Topic ID, default `0`; omitted when `≤0` |

`beta` and `beta_flash` keep separate Android / iOS groups; fill in both.

## KV keys

| Script | Keys |
| --- | --- |
| beta | `pubg_exp_current_version`, `pubg_exp_32_version`, `pubg_exp_32_url`, `pubg_exp_64_version`, `pubg_exp_64_url`, `pubg_exp_apk_links`, `pubg_ios_current_version`, `pubg_ios_ipa_links` |
| beta_flash | `pubg_flash_exp_current_version`, `pubg_flash_exp_android_version`, `pubg_flash_exp_android_url`, `pubg_flash_exp_apk_links`, `pubg_flash_ios_current_version`, `pubg_flash_ios_ipa_links` |
| pubgm | `pubgm_tw_current_version`, `pubgm_tw_apk_url`, `pubgm_global_current_version`, `pubgm_global_apk_url`, `pubgm_vn_current_version`, `pubgm_vn_apk_url`, `pubgm_apk_links` |
| hp | `hpios_current_version`, `hpios_ipa_link`, `hpandroid_current_version`, `hpandroid_apk_link` |
| bgmi | `bgmi_current_version`, `bgmi_apk_link` |

## Notes

- On first run KV is empty, so the current latest version is notified once.
- Versions are split on `.`, padded to 4 segments, and compared segment by segment.
- If a page structure changes, the regex may stop matching and needs updating.
- The five scripts can share one KV namespace.

## License

[MIT](LICENSE)
