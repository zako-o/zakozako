const CONFIG = {
    BOT_TOKEN: "",
    CHAT_ID: "",
    THREAD_ID: 0,

    VERSIONS: {
        "台湾版": {
            url: "https://www.pubgmobile.com/TW/home.shtml",
            kvVersionKey: "pubgm_tw_current_version",
            kvUrlKey: "pubgm_tw_apk_url"
        },
        "全球版": {
            url: "https://www.pubgmobile.com/HK/home.shtml",
            kvVersionKey: "pubgm_global_current_version",
            kvUrlKey: "pubgm_global_apk_url"
        },
        "越南版": {
            url: "https://pubgm.vnggames.com/index.html",
            kvVersionKey: "pubgm_vn_current_version",
            kvUrlKey: "pubgm_vn_apk_url"
        }

    },
    APK_LINKS_KEY: "pubgm_apk_links"
};

function formatBeijingTime() {
    const date = new Date();

    const beijingTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    const year = beijingTime.getUTCFullYear();
    const month = String(beijingTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(beijingTime.getUTCDate()).padStart(2, '0');
    const hours = String(beijingTime.getUTCHours()).padStart(2, '0');
    const minutes = String(beijingTime.getUTCMinutes()).padStart(2, '0');
    const seconds = String(beijingTime.getUTCSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function isVersionNewer(v1, v2) {
    if (!v1 || !v2) return false;

    const padVersion = (version) => {
        const parts = version.split('.').map(Number);
        while (parts.length < 4) parts.push(0);
        return parts.map(p => p.toString().padStart(4, '0')).join('');
    };

    return padVersion(v1) > padVersion(v2);
}

function log(message) {
    const logEntry = `${formatBeijingTime()} - ${message}`;
    console.log(logEntry);
}

async function extractPubgmInfo(versionName, url) {
    try {

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html, */*'
            },
            timeout: 15000,
            redirect: 'follow',
            cf: { cacheTtl: 0 }
        });

        if (!response.ok) {
            throw new Error(`请求失败，状态码：${response.status}`);
        }

        const pageContent = await response.text();

        const apkUrlMatch = pageContent.match(/<a href="(https?:\/\/[^"]+\.apk)"[^>]*class="[^"]*(?:newapk-btn|btn_apk)[^"]*"/i);
        if (!apkUrlMatch || !apkUrlMatch[1]) {
            throw new Error(`${versionName} APK链接未找到`);
        }
        const apkUrl = apkUrlMatch[1].trim();

        let versionMatch = apkUrl.match(/\d+\.\d+\.\d+\.\d+/);
        if (!versionMatch) {
            versionMatch = apkUrl.match(/\d+\.\d+\.\d+/);
        }
        if (!versionMatch || !versionMatch[0]) {
            throw new Error(`${versionName} 版本号未找到`);
        }
        const version = versionMatch[0].trim().replace(/\.$/, '');

        log(`${versionName} 提取到的版本号: ${version}`);
        return { apkUrl, version };
    } catch (error) {
        log(`${versionName} 获取APK信息失败: ${error.message}`);
        return null;
    }
}

async function sendNotice(message) {
    try {
        const noticeUrl = `https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`;

        const postData = {
            chat_id: CONFIG.CHAT_ID,
            text: message,
            disable_web_page_preview: true,
            parse_mode: 'html',
            disable_notification: false
        };
        if (CONFIG.THREAD_ID > 0) {
            postData.message_thread_id = CONFIG.THREAD_ID;
        }

        const response = await fetch(noticeUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Accept': 'application/json'
            },
            body: JSON.stringify(postData)
        });

        const result = await response.json();
        if (!result.ok) {
            throw new Error(`接口返回错误：${result.description || '未知错误'}`);
        }

        log("通知发送成功");
        return true;
    } catch (error) {
        log(`通知发送失败: ${error.message}`);
        return false;
    }
}

async function checkSingleVersion(kvNamespace, versionName, versionConfig) {

    let currentVersion = '0.0.0';
    try {
        currentVersion = await kvNamespace.get(versionConfig.kvVersionKey) || '0.0.0';
        log(`${versionName} 当前保存的版本: ${currentVersion}`);
    } catch (error) {
        log(`${versionName} 读取KV版本失败: ${error.message}，使用默认版本0.0.0`);
    }

    const pubgmInfo = await extractPubgmInfo(versionName, versionConfig.url);
    if (!pubgmInfo) {
        return { updated: false, name: versionName, error: "提取信息失败" };
    }
    const { apkUrl, version: newVersion } = pubgmInfo;
    log(`${versionName} 最新版本: ${newVersion}`);

    if (isVersionNewer(newVersion, currentVersion)) {

        await kvNamespace.put(versionConfig.kvVersionKey, newVersion);
        await kvNamespace.put(versionConfig.kvUrlKey, apkUrl);
        log(`${versionName} 检测到新版本，已更新KV（版本+链接）`);

        return {
            updated: true,
            name: versionName,
            version: newVersion,
            url: apkUrl
        };
    } else {
        log(`${versionName} 当前已是最新版本: ${newVersion}，无需更新`);
        return {
            updated: false,
            name: versionName
        };
    }
}

async function runCoreDetection(kvNamespace) {
    log("===== 开始检测（台湾版 / 全球版 / 越南版）=====");

    if (!kvNamespace) {
        log("KV命名空间未绑定，检测终止");
        return { success: false, message: "KV未绑定" };
    }

    const results = [];
    for (const [name, config] of Object.entries(CONFIG.VERSIONS)) {
        const result = await checkSingleVersion(kvNamespace, name, config);
        results.push(result);
    }

    const updatedVersions = results.filter(r => r.updated);

    if (updatedVersions.length > 0) {

        const currentTime = formatBeijingTime();
        const messageParts = [
            `当前时间：${currentTime}`,
            ...updatedVersions.map(item => `${item.name} 新版本：${item.version}`)
        ];

        const links = updatedVersions.map(item => `${item.name} APK: ${item.url}`).join("\n\n");
        messageParts.push("\n" + links);

        const finalMessage = messageParts.join("\n");

        await kvNamespace.put(CONFIG.APK_LINKS_KEY, links);
        log(`已存储拼接后的APK链接到KV: ${CONFIG.APK_LINKS_KEY}`);

        await sendNotice(finalMessage);

        const updatedStrings = updatedVersions.map(item => `${item.name} ${item.version}`).join(", ");
        log(`已通知新版本: ${updatedStrings}`);

        return { success: true, updated: true, count: updatedVersions.length };
    } else {
        log("所有版本均为最新，无需通知");
        return { success: true, updated: false };
    }
}

export default {

    async fetch(request, env) {
        try {

            const result = await runCoreDetection(env.PUBG_KV);

            const currentTime = formatBeijingTime();
            let responseText = '';

            if (!result.success) {
                responseText = `[${currentTime}] 版本检测失败：${result.message}`;
            } else if (result.updated) {
                responseText = `[${currentTime}] 版本检测成功：检测到 ${result.count} 个新版本，已发送通知（链接已存储）`;
            } else {
                responseText = `[${currentTime}] 版本检测成功：所有版本均为最新`;
            }

            return new Response(responseText, {
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'Cache-Control': 'no-cache'
                },
                status: result.success ? 200 : 500
            });
        } catch (error) {
            const errorMsg = `[${formatBeijingTime()}] 检测异常：${error.message}`;
            log(errorMsg);
            return new Response(errorMsg, {
                status: 500,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
        }
    },

    async scheduled(event, env) {

        await runCoreDetection(env.PUBG_KV);
        log("定时检测完成，下一次检测间隔以 Cloudflare Cron 配置为准");
    }
};
