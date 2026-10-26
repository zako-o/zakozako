const CONFIG = {
    BOT_TOKEN: "",
    CHAT_ID: "",
    THREAD_ID: 0,
    BGMI_DOWNLOAD_URL: "https://www.battlegroundsmobileindia.com",
    KV_KEY_VERSION: "bgmi_current_version",
    KV_KEY_APK_URL: "bgmi_apk_link"
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

async function extractBGMIInfo() {
    try {
        const response = await fetch(CONFIG.BGMI_DOWNLOAD_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html, */*'
            },
            timeout: 15000,
            redirect: 'follow',
            cf: { cacheTtl: 0 }
        });

        if (!response.ok) {
            throw new Error(`地址请求失败，状态码：${response.status}`);
        }

        const pageContent = await response.text();

        const apkUrlMatch = pageContent.match(/https?:\/\/[^"]+\.apk/i);
        if (!apkUrlMatch || !apkUrlMatch[0]) {
            throw new Error('未从页面中提取到APK下载链接');
        }
        const apkUrl = apkUrlMatch[0].trim();

        let versionMatch = apkUrl.match(/\d+\.\d+\.\d+\.\d+/);
        if (!versionMatch) {
            versionMatch = apkUrl.match(/\d+\.\d+\.\d+/);
        }
        if (!versionMatch || !versionMatch[0]) {
            throw new Error('未从APK链接中提取到版本号');
        }
        const version = versionMatch[0].trim().replace(/\.$/, '');

        return { apkUrl, version };
    } catch (error) {
        console.error(`[${formatBeijingTime()}] 提取信息失败：${error.message}`);
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

        console.log(`[${formatBeijingTime()}] 通知发送成功（话题${CONFIG.THREAD_ID}）`);
        return true;
    } catch (error) {
        console.error(`[${formatBeijingTime()}] 通知发送失败：${error.message}`);
        return false;
    }
}

async function runCoreDetection(kvNamespace) {
    const currentTime = formatBeijingTime();
    console.log(`[${currentTime}] 开始版本检测`);

    if (!kvNamespace) {
        const errorMsg = 'KV命名空间未绑定，检测终止';
        console.error(`[${currentTime}] ${errorMsg}`);
        return { success: false, message: errorMsg };
    }

    let oldVersion = '0.0.0';
    try {
        oldVersion = await kvNamespace.get(CONFIG.KV_KEY_VERSION) || '0.0.0';
        console.log(`[${currentTime}] KV中保存的版本：${oldVersion}`);
    } catch (error) {
        console.error(`[${currentTime}] 读取KV版本失败：${error.message}，使用默认版本0.0.0`);
    }

    const bgmiInfo = await extractBGMIInfo();
    if (!bgmiInfo) {
        return { success: false, message: '提取BGMI版本/APK链接失败' };
    }
    const { apkUrl, version: newVersion } = bgmiInfo;
    console.log(`[${currentTime}] 检测到最新版本：${newVersion}`);

    if (isVersionNewer(newVersion, oldVersion)) {
        const updateTasks = [
            kvNamespace.put(CONFIG.KV_KEY_VERSION, newVersion),
            kvNamespace.put(CONFIG.KV_KEY_APK_URL, apkUrl)
        ];
        await Promise.all(updateTasks);
        console.log(`[${currentTime}] KV版本更新完成：${oldVersion} → ${newVersion}`);

        const pushMessage = `当前时间：${currentTime}
检测到新版本（版本号：${newVersion}）

地址：${apkUrl}`;

        const pushSuccess = await sendNotice(pushMessage);

        return {
            success: true,
            updated: true,
            oldVersion,
            newVersion,
            apkUrl,
            pushSuccess
        };
    } else {
        return {
            success: true,
            updated: false,
            currentVersion: oldVersion
        };
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
                responseText = `[${currentTime}] 版本检测成功：
- 旧版本：${result.oldVersion}
- 新版本：${result.newVersion}
- 通知发送：${result.pushSuccess ? '成功' : '失败'}`;
            } else {
                responseText = `[${currentTime}] 版本检测成功：当前为最新版本 ${result.currentVersion}`;
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
            console.error(errorMsg);
            return new Response(errorMsg, {
                status: 500,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
        }
    },

    async scheduled(event, env) {
        await runCoreDetection(env.PUBG_KV);
    }
};
