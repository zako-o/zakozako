const CONFIG = {
    BOT_TOKEN: "",
    CHAT_ID: "",
    THREAD_ID: 0,

    IOS: {
        PLIST_URL: "https://dlied1.qq.com/jdqssy/exp/pa.plist",
        KV_KEY_VERSION: "hpios_current_version",
        KV_KEY_DOWNLOAD_URL: "hpios_ipa_link",
        NAME: "iOS"
    },

    ANDROID: {
        APK_DOWNLOAD_PAGE: "https://dlied1.qq.com/jdqssy/exp/pb.html",
        KV_KEY_VERSION: "hpandroid_current_version",
        KV_KEY_DOWNLOAD_URL: "hpandroid_apk_link",
        NAME: "Android"
    },

    DEFAULT_VERSION: "0.0.0",
    TIMEOUT: 15000
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

        console.log(`[${formatBeijingTime()}] 通知发送成功（话题${CONFIG.THREAD_ID}）`);
        return true;
    } catch (error) {
        console.error(`[${formatBeijingTime()}] 通知发送失败：${error.message}`);
        return false;
    }
}

async function extractIOSInfo() {
    const currentTime = formatBeijingTime();
    try {
        const response = await fetch(CONFIG.IOS.PLIST_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/plain, */*'
            },
            timeout: CONFIG.TIMEOUT,
            redirect: 'follow',
            cf: { cacheTtl: 0 }
        });

        if (!response.ok) {
            throw new Error(`Plist请求失败，状态码：${response.status}`);
        }

        const plistContent = await response.text();

        const ipaUrlMatch = plistContent.match(/<key>url<\/key>\s*<string>(https?:\/\/[^<]+?\.ipa)<\/string>/i);
        if (!ipaUrlMatch || !ipaUrlMatch[1]) {
            throw new Error('未从plist中提取到IPA下载链接');
        }
        const downloadUrl = ipaUrlMatch[1].trim();

        let versionMatch = downloadUrl.match(/\d+\.\d+\.\d+\.\d+/);
        if (!versionMatch) {
            versionMatch = downloadUrl.match(/\d+\.\d+\.\d+/);
        }
        if (!versionMatch || !versionMatch[0]) {
            throw new Error('未从IPA链接中提取到版本号');
        }
        const version = versionMatch[0].trim().replace(/\.$/, '');

        return { downloadUrl, version };
    } catch (error) {
        console.error(`[${currentTime}] 提取iOS信息失败：${error.message}`);
        return null;
    }
}

async function extractAndroidInfo() {
    const currentTime = formatBeijingTime();
    try {
        const response = await fetch(CONFIG.ANDROID.APK_DOWNLOAD_PAGE, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html, */*'
            },
            timeout: CONFIG.TIMEOUT,
            redirect: 'follow',
            cf: { cacheTtl: 0 }
        });

        if (!response.ok) {
            throw new Error(`APK下载页请求失败，状态码：${response.status}`);
        }

        const pageContent = await response.text();

        const apkUrlMatch = pageContent.match(/href="(https?:\/\/[^"]+\.apk)"/i);
        if (!apkUrlMatch || !apkUrlMatch[1]) {
            throw new Error('未从下载页中提取到APK下载链接');
        }
        const downloadUrl = apkUrlMatch[1].trim();

        let versionMatch = downloadUrl.match(/\d+\.\d+\.\d+\.\d+/);
        if (!versionMatch) {
            versionMatch = downloadUrl.match(/\d+\.\d+\.\d+/);
        }
        if (!versionMatch || !versionMatch[0]) {
            throw new Error('未从APK链接中提取到版本号');
        }
        const version = versionMatch[0].trim().replace(/\.$/, '');

        return { downloadUrl, version };
    } catch (error) {
        console.error(`[${currentTime}] 提取Android信息失败：${error.message}`);
        return null;
    }
}

async function detectPlatformVersion(platformConfig, extractInfoFunc, kvNamespace) {
    const currentTime = formatBeijingTime();
    const platformName = platformConfig.NAME;
    console.log(`[${currentTime}] 开始${platformName}版本检测`);

    if (!kvNamespace) {
        const errorMsg = `${platformName}检测：KV命名空间未绑定，检测终止`;
        console.error(`[${currentTime}] ${errorMsg}`);
        return { success: false, platform: platformName, message: errorMsg };
    }

    let oldVersion = CONFIG.DEFAULT_VERSION;
    try {
        oldVersion = await kvNamespace.get(platformConfig.KV_KEY_VERSION) || CONFIG.DEFAULT_VERSION;
        console.log(`[${currentTime}] ${platformName} KV中保存的版本：${oldVersion}`);
    } catch (error) {
        console.error(`[${currentTime}] ${platformName} 读取KV版本失败：${error.message}，使用默认版本${CONFIG.DEFAULT_VERSION}`);
    }

    const platformInfo = await extractInfoFunc();
    if (!platformInfo) {
        return {
            success: false,
            platform: platformName,
            message: `提取${platformName}版本/下载链接失败`
        };
    }
    const { downloadUrl, version: newVersion } = platformInfo;
    console.log(`[${currentTime}] ${platformName} 检测到最新版本：${newVersion}`);

    if (isVersionNewer(newVersion, oldVersion)) {
        const updateTasks = [
            kvNamespace.put(platformConfig.KV_KEY_VERSION, newVersion),
            kvNamespace.put(platformConfig.KV_KEY_DOWNLOAD_URL, downloadUrl)
        ];
        await Promise.all(updateTasks);
        console.log(`[${currentTime}] ${platformName} KV版本更新完成：${oldVersion} → ${newVersion}`);

        const pushMessage = `当前时间：${currentTime}
${platformName} 新版本：${newVersion}

下载链接：${downloadUrl}`;

        const pushSuccess = await sendNotice(pushMessage);

        return {
            success: true,
            platform: platformName,
            updated: true,
            oldVersion,
            newVersion,
            downloadUrl,
            pushSuccess
        };
    } else {
        return {
            success: true,
            platform: platformName,
            updated: false,
            currentVersion: oldVersion
        };
    }
}

async function runAllDetection(kvNamespace) {
    const [iosResult, androidResult] = await Promise.all([
        detectPlatformVersion(CONFIG.IOS, extractIOSInfo, kvNamespace),
        detectPlatformVersion(CONFIG.ANDROID, extractAndroidInfo, kvNamespace)
    ]);

    return [iosResult, androidResult];
}

export default {
    async fetch(request, env) {
        try {
            const currentTime = formatBeijingTime();
            const results = await runAllDetection(env.PUBG_KV);

            let responseText = `[${currentTime}] 版本检测结果：\n\n`;

            results.forEach(result => {
                if (!result.success) {
                    responseText += `【${result.platform}】检测失败：${result.message}\n`;
                } else if (result.updated) {
                    responseText += `【${result.platform}】检测成功（有更新）：
- 旧版本：${result.oldVersion}
- 新版本：${result.newVersion}
- 通知发送：${result.pushSuccess ? '成功' : '失败'}\n`;
                } else {
                    responseText += `【${result.platform}】检测成功（无更新）：当前为最新版本 ${result.currentVersion}\n`;
                }
                responseText += '\n';
            });

            return new Response(responseText, {
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'Cache-Control': 'no-cache'
                },
                status: results.every(r => r.success) ? 200 : 500
            });
        } catch (error) {
            const errorMsg = `[${formatBeijingTime()}] 版本检测异常：${error.message}`;
            console.error(errorMsg);
            return new Response(errorMsg, {
                status: 500,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
        }
    },

    async scheduled(event, env) {
        await runAllDetection(env.PUBG_KV);
    }
};
