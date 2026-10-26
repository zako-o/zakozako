const CONFIG = {
    CHECK_TIMEOUT: 15000,
    CHECK_RETRY: 3,
    ANDROID: {
        BOT_TOKEN: "",
        CHAT_ID: "",
        THREAD_ID: 0,
        ARCH_CONFIGS: {
            "Android": {
                url: "https://web.gpubgm.com/flash/BETA/download_android.html",
                kvVersionKey: "pubg_flash_exp_android_version",
                kvUrlKey: "pubg_flash_exp_android_url"
            }
        },
        GLOBAL_VERSION_KEY: "pubg_flash_exp_current_version",
        APK_LINKS_KEY: "pubg_flash_exp_apk_links",
        CHECK_INTERVAL: 30
    },
    IOS: {
        BOT_TOKEN: "",
        CHAT_ID: "",
        THREAD_ID: 0,
        PLIST_URL: "https://web.gpubgm.com/flash/BETA/pa.plist",
        CURRENT_VERSION_KEY: "pubg_flash_ios_current_version",
        IPA_LINKS_KEY: "pubg_flash_ios_ipa_links"
    }
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

function versionToTuple(v) {
    return v.split('.').map(Number);
}

function log(message, type = "INFO") {
    const logEntry = `${formatBeijingTime()} [${type}] - ${message}`;
    console.log(logEntry);
}

async function sendNotice(config, message) {
    try {
        const noticeUrl = `https://api.telegram.org/bot${config.BOT_TOKEN}/sendMessage`;
        const postData = {
            chat_id: config.CHAT_ID,
            text: message,
            disable_web_page_preview: true
        };
        if (config.THREAD_ID > 0) {
            postData.message_thread_id = config.THREAD_ID;
        }

        const response = await fetch(noticeUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify(postData)
        });

        const result = await response.json();
        if (!result.ok) {
            throw new Error(`接口错误：${result.description || '未知错误'}`);
        }
        log("通知发送成功");
        return true;
    } catch (error) {
        log(`通知发送失败: ${error.message}`, "ERROR");
        return false;
    }
}

async function extractAndroidInfo(archName, url) {
    for (let i = 0; i < CONFIG.CHECK_RETRY; i++) {
        try {
            const response = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                timeout: CONFIG.CHECK_TIMEOUT,
                redirect: 'follow',
                cf: { cacheTtl: 0 }
            });

            if (!response.ok) throw new Error(`状态码：${response.status}`);
            const pageContent = await response.text();

            const apkUrlMatch = pageContent.match(/https?:\/\/[^"]+\.apk/i);
            if (!apkUrlMatch) throw new Error("APK链接未找到");
            const apkUrl = apkUrlMatch[0].trim();

            let versionMatch = apkUrl.match(/\d+\.\d+\.\d+\.\d+/);
            if (!versionMatch) versionMatch = apkUrl.match(/\d+\.\d+\.\d+/);
            if (!versionMatch) throw new Error("版本号未找到");
            const version = versionMatch[0].trim().replace(/\.$/, '');

            log(`${archName} 提取成功 - 版本：${version}`);
            return { apkUrl, version };
        } catch (error) {
            log(`${archName} 第${i+1}次提取失败: ${error.message}`, "WARN");
            if (i === CONFIG.CHECK_RETRY - 1) return null;
        }
    }
    return null;
}

async function runAndroidDetection(kvNamespace) {
    log("===== 开始检测Android版本 =====");
    const androidConfig = CONFIG.ANDROID;

    if (!kvNamespace) {
        log("KV未绑定，终止Android检测", "ERROR");
        return { success: false, message: "KV命名空间未绑定" };
    }

    let currentVersion = '0.0.0';
    try {
        const storedVersion = await kvNamespace.get(androidConfig.GLOBAL_VERSION_KEY);
        if (storedVersion) currentVersion = storedVersion;
    } catch (error) {
        log(`读取Android版本失败: ${error.message}`, "WARN");
    }
    log(`Android当前版本: ${currentVersion}`);

    const archNames = Object.keys(androidConfig.ARCH_CONFIGS);
    const archResults = {};
    let hasError = false;
    for (const archName of archNames) {
        const info = await extractAndroidInfo(archName, androidConfig.ARCH_CONFIGS[archName].url);
        if (!info) {
            hasError = true;
            continue;
        }
        archResults[archName] = info;
    }

    if (hasError || archNames.some(name => !archResults[name])) {
        log("Android架构信息提取失败", "ERROR");
        return { success: false, message: "Android信息提取失败" };
    }

    const allNewer = archNames.every(name => isVersionNewer(archResults[name].version, currentVersion));
    const baseMajor = versionToTuple(archResults[archNames[0]].version).slice(0, 2).join('.');
    const majorMatch = archNames.every(name =>
        versionToTuple(archResults[name].version).slice(0, 2).join('.') === baseMajor
    );

    if (!allNewer || !majorMatch) {
        const reason = [];
        if (!allNewer) {
            archNames.forEach(name => {
                if (!isVersionNewer(archResults[name].version, currentVersion)) {
                    reason.push(`${name}(${archResults[name].version})未更新`);
                }
            });
        }
        if (!majorMatch) reason.push("各架构主版本不一致");
        log(`Android无需通知: ${reason.join(', ')}`);
        return { success: true, updated: false, reason: reason.join(', ') };
    }

    let newVersion = archResults[archNames[0]].version;
    for (const name of archNames) {
        if (isVersionNewer(archResults[name].version, newVersion)) {
            newVersion = archResults[name].version;
        }
    }

    for (const name of archNames) {
        await kvNamespace.put(androidConfig.ARCH_CONFIGS[name].kvVersionKey, archResults[name].version);
        await kvNamespace.put(androidConfig.ARCH_CONFIGS[name].kvUrlKey, archResults[name].apkUrl);
    }
    const linksContent = archNames
        .map(name => `${name}: ${archResults[name].apkUrl}`)
        .join('\n\n') + '\n';
    await kvNamespace.put(androidConfig.APK_LINKS_KEY, linksContent);
    await kvNamespace.put(androidConfig.GLOBAL_VERSION_KEY, newVersion);

    const message = `当前时间：${formatBeijingTime()}
Android 新版本：${newVersion}

${linksContent}`;
    await sendNotice(androidConfig, message);
    log(`Android新版本通知成功: ${newVersion}`);

    return { success: true, updated: true, newVersion };
}

async function extractIosInfo() {
    for (let i = 0; i < CONFIG.CHECK_RETRY; i++) {
        try {
            const response = await fetch(CONFIG.IOS.PLIST_URL, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: CONFIG.CHECK_TIMEOUT,
                redirect: 'follow'
            });

            if (!response.ok) throw new Error(`状态码：${response.status}`);
            const plistContent = await response.text();

            const ipaUrlMatch = plistContent.match(/https?:\/\/[^"]+\.ipa/i);
            if (!ipaUrlMatch) throw new Error("IPA链接未找到");
            const ipaUrl = ipaUrlMatch[0].trim();

            const versionMatch = ipaUrl.match(/[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/);
            if (!versionMatch) throw new Error("版本号未找到");
            const version = versionMatch[0].trim().replace(/\.$/, '');

            log(`iOS提取成功 - 版本：${version}`);
            return { ipaUrl, version };
        } catch (error) {
            log(`iOS第${i+1}次提取失败: ${error.message}`, "WARN");
            if (i === CONFIG.CHECK_RETRY - 1) return null;
        }
    }
    return null;
}

async function runIosDetection(kvNamespace) {
    log("===== 开始检测iOS版本 =====");
    const iosConfig = CONFIG.IOS;

    if (!kvNamespace) {
        log("KV未绑定，终止iOS检测", "ERROR");
        return { success: false, message: "KV命名空间未绑定" };
    }

    let currentVersion = '0.0.0';
    try {
        const storedVersion = await kvNamespace.get(iosConfig.CURRENT_VERSION_KEY);
        if (storedVersion) currentVersion = storedVersion;
    } catch (error) {
        log(`读取iOS版本失败: ${error.message}`, "WARN");
    }
    log(`iOS当前版本: ${currentVersion}`);

    const iosInfo = await extractIosInfo();
    if (!iosInfo) {
        log("iOS信息提取失败", "ERROR");
        return { success: false, message: "iOS IPA/版本提取失败" };
    }
    const { ipaUrl, version: newVersion } = iosInfo;

    if (!isVersionNewer(newVersion, currentVersion)) {
        log(`iOS无需通知: 当前已是最新版本(${currentVersion})`);
        return { success: true, updated: false, currentVersion, newVersion };
    }

    const linksContent = `iOS安装包: ${ipaUrl}`;
    await kvNamespace.put(iosConfig.IPA_LINKS_KEY, linksContent);
    await kvNamespace.put(iosConfig.CURRENT_VERSION_KEY, newVersion);

    const message = `当前时间：${formatBeijingTime()}
iOS 新版本：${newVersion}

${linksContent}`;
    await sendNotice(iosConfig, message);
    log(`iOS新版本通知成功: ${newVersion}`);

    return { success: true, updated: true, newVersion, ipaUrl };
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;

        try {
            let result, responseText;
            const currentTime = formatBeijingTime();

            if (path === '/android') {
                result = await runAndroidDetection(env.PUBG_KV);
                if (!result.success) {
                    responseText = `[${currentTime}] Android检测失败：${result.message}`;
                } else if (result.updated) {
                    responseText = `[${currentTime}] Android检测成功：已通知新版本 ${result.newVersion}`;
                } else {
                    responseText = `[${currentTime}] Android检测成功：无需通知（${result.reason}）`;
                }
            }
            else if (path === '/ios') {
                result = await runIosDetection(env.PUBG_KV);
                if (!result.success) {
                    responseText = `[${currentTime}] iOS检测失败：${result.message}`;
                } else if (result.updated) {
                    responseText = `[${currentTime}] iOS检测成功：已通知新版本 ${result.newVersion}`;
                } else {
                    responseText = `[${currentTime}] iOS检测成功：当前已是最新版本(${result.currentVersion})`;
                }
            }
            else {
                responseText = `
版本检测服务
=========================
触发路径：
- /android → 检测 Android 版本
- /ios     → 检测iOS版本
定时触发：Cron Trigger 自动检测Android+iOS
当前时间：${currentTime}
                `.trim();
            }

            return new Response(responseText, {
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'Cache-Control': 'no-cache'
                },
                status: result?.success !== false ? 200 : 500
            });
        } catch (error) {
            const errorMsg = `[${formatBeijingTime()}] 系统异常：${error.message}`;
            log(errorMsg, "ERROR");
            return new Response(errorMsg, { status: 500 });
        }
    },

    async scheduled(event, env) {
        await runAndroidDetection(env.PUBG_KV);
        await runIosDetection(env.PUBG_KV);
        log("===== 定时检测完成（Android + iOS）=====");
    }
};
