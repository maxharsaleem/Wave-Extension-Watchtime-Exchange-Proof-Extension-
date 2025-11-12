let scrollIntervalId = null;
let ytIntervalId = null;
let running = false;
let shotCount = 0;
let lastShotTs = null;
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw-hKMBBMUis3wzhTsDbutfrUTewIpuPNP0sZ_2Kbs17QRVS9BWZbL6RIO108dO0TXj/exec";
/* ================================
   📩 Message handler (ONE place only)
   ================================ */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg?.type) return;
    switch (msg.type) {
        case "GET_STATE":
            chrome.storage.local.get({
                enabled: false
            }, (res) => {
                sendResponse({
                    ok: true,
                    state: {
                        running,
                        shotCount,
                        lastShotTs,
                        enabled: res.enabled
                    }
                });
            });
            return true;
        case "RESET_CHANNEL_HANDLE":
            chrome.storage.local.set({
                channelHandle: ""
            });
            sendResponse({
                ok: true
            });
            break;
        case "TAKE_SCREENSHOT_NOW":
            captureScreenshot();
            sendResponse({
                ok: true
            });
            break;
        case "UPLOAD_TO_SHEET":
            uploadToSheet(msg.data.channelHandle, msg.data.images)
                .then(() => sendResponse({
                    ok: true
                }))
                .catch(() => sendResponse({
                    ok: false
                }));
            return true;
        case "UPLOAD_AT_85":
            handleUploadAt85(sender);
            break;
        case "closeTab":
            if (sender?.tab?.id) chrome.tabs.remove(sender.tab.id);
            break;
        case "FORCE_RUNNING":
            if (!running) startAll();
            break;
    }
});
/* ================================
   🚀 Auto start on YouTube
   ================================ */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && tab.url && tab.url.includes("youtube.com/watch")) {
        chrome.storage.local.get({
            enabled: true
        }, (res) => {
            if (res.enabled) startAll();
        });
    }
});
/* ================================
   📤 Auto upload on tab close
   ================================ */
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    chrome.storage.local.get({
        photos: [],
        channelHandle: "",
        uploadOnClose: true,
        mode: "videoSearch"
    }, (res) => {
        if ((res.photos?.length || 0) > 0 && res.channelHandle && res.uploadOnClose && res.mode === "videoSearch") {
            uploadToSheet(res.channelHandle, res.photos.map(p => p.url))
                .then(() => {
                    chrome.storage.local.set({
                        photos: []
                    }, () => {
                        shotCount = 0;
                        lastShotTs = null;
                        notifyPopup();
                    });
                })
                .catch(err => console.error("[AutoScreenshot] Auto-upload on close failed:", err));
        }
    });
});
/* ================================
   ▶️ Start
   ================================ */
function startAll() {
    if (running) return;
    running = true;
    chrome.storage.local.set({
        running
    });
    if (!scrollIntervalId) scrollIntervalId = setInterval(scrollActivePage, 9000);
    if (!ytIntervalId) ytIntervalId = setInterval(keepYouTubeControlsVisible, 90000);
    chrome.tabs.query({
        active: true,
        currentWindow: true
    }, (tabs) => {
        if (tabs[0]?.id) chrome.tabs.sendMessage(tabs[0].id, {
                type: "TIMER_START"
            })
            .catch(() => {});
    });
    notifyPopup();
}
/* ================================
   ⏹ Stop
   ================================ */
function stopAll() {
    running = false;
    chrome.storage.local.set({
        running
    });
    clearInterval(scrollIntervalId);
    scrollIntervalId = null;
    clearInterval(ytIntervalId);
    ytIntervalId = null;
    chrome.tabs.query({
        active: true,
        currentWindow: true
    }, (tabs) => {
        if (tabs[0]?.id) chrome.tabs.sendMessage(tabs[0].id, {
                type: "TIMER_STOP"
            })
            .catch(() => {});
    });
    notifyPopup();
}
/* ================================
   🔔 Notify popup
   ================================ */
function notifyPopup() {
    chrome.storage.local.get({
        photos: []
    }, (res) => {
        chrome.runtime.sendMessage({
                type: "STATE_UPDATED",
                payload: {
                    running,
                    shotCount,
                    lastShotTs,
                    photos: res.photos
                }
            })
            .catch(() => {});
    });
}
/* ================================
   📸 Capture screenshot
   ================================ */
function captureScreenshot() {
    chrome.storage.local.get({
        photos: [],
        currentVideoId: null
    }, (res) => {
        const photos = res.photos || [];
        const currentVideoId = res.currentVideoId || "unknown";
        const shotsForThisVideo = photos.filter(p => p.videoId === currentVideoId)
            .length;
        if (shotsForThisVideo >= 5) {
            console.log("[AutoScreenshot] Max 5 screenshots reached for video:", currentVideoId);
            return;
        }
        chrome.tabs.captureVisibleTab({
            format: "png"
        }, (dataUrl) => {
            if (chrome.runtime.lastError) return;
            shotCount++;
            lastShotTs = Date.now();
            photos.push({
                url: dataUrl,
                ts: lastShotTs,
                videoId: currentVideoId
            });
            chrome.storage.local.set({
                photos
            }, notifyPopup);
        });
    });
}
/* ================================
   📤 Upload to Google Sheets
   ================================ */
async function uploadToSheet(channelHandle, images) {
    const res = await chrome.storage.local.get({
        videoTitle: "",
        videoDuration: "",
        channelName: "",
        playSeconds: 0,
        stopSeconds: 0
    });
    const payload = {
        channelHandle,
        channelName: res.channelName,
        videoTitle: res.videoTitle,
        videoDuration: res.videoDuration,
        images,
        playSeconds: res.playSeconds,
        stopSeconds: res.stopSeconds
    };
    const resp = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });
    if (!resp.ok) throw new Error("Apps Script returned HTTP " + resp.status);
    const data = await resp.json();
    console.log("[AutoScreenshot] Upload result:", data);
    return data;
}
/* ================================
   ⬆️ Handle Upload at 85%
   ================================ */
function handleUploadAt85(sender) {
    chrome.storage.local.get({
        channelHandle: "",
        photos: [],
        mode: "videoSearch"
    }, (res) => {
        uploadToSheet(res.channelHandle, res.photos.map(p => p.url))
            .then(() => {
                console.log("[AutoScreenshot] Auto-upload at 85% complete");
                chrome.storage.local.set({
                    photos: [],
                    playSeconds: 0,
                    stopSeconds: 0,
                    videoTitle: "",
                    videoDuration: "",
                    currentVideoId: null,
                    uploadedAt85: false
                }, () => {
                    shotCount = 0;
                    lastShotTs = null;
                    if (res.mode === "playlist") {
                        // Playlist Mode → go to next video instead of closing
                        if (sender?.tab?.id) goToNextVideo(sender.tab.id);
                    } else {
                        // Video Search Mode → close tab
                        if (sender?.tab?.id) {
                            chrome.tabs.remove(sender.tab.id, () => {
                                console.log("[AutoScreenshot] Closed YouTube tab after 85% complete.");
                            });
                        }
                    }
                    chrome.tabs.query({
                        active: true,
                        currentWindow: true
                    }, (tabs) => {
                        if (tabs[0]?.id) {
                            chrome.tabs.sendMessage(tabs[0].id, {
                                    type: "RESET_ALL_TIMERS"
                                })
                                .catch(() => {});
                        }
                    });
                    stopAll();
                    notifyPopup();
                });
            })
            .catch(err => console.error("[AutoScreenshot] Auto-upload at 85% failed:", err));
    });
}
/* ================================
   ▶️ Go to Next Video (Playlist Mode)
   ================================ */
function goToNextVideo(tabId) {
    chrome.scripting.executeScript({
        target: {
            tabId
        },
        func: () => {
            const nextBtn = document.querySelector(".ytp-next-button");
            if (nextBtn) {
                nextBtn.click();
            } else {
                console.warn("[AutoScreenshot] No next button found in player.");
            }
        }
    });
}
/* ================================
   📜 Auto scroll (non-YouTube)
   ================================ */
async function scrollActivePage() {
    try {
        const [tab] = await chrome.tabs.query({
            active: true,
            lastFocusedWindow: true
        });
        // ✅ Run only if tab exists AND is a YouTube watch page
        if (!tab?.id || !tab.url.includes("youtube.com/watch")) return;
        await chrome.scripting.executeScript({
            target: {
                tabId: tab.id
            },
            func: () => {
                // Toggle scroll: if near top, scroll down slightly; otherwise, scroll to top
                if (window.scrollY < 10) {
                    window.scrollBy({
                        top: 50,
                        behavior: "smooth"
                    });
                } else {
                    window.scrollTo({
                        top: 0,
                        behavior: "smooth"
                    });
                }
            }
        });
    } catch (error) {
        console.warn("Scroll script failed:", error);
    }
}
/* ================================
   🎬 Keep YouTube controls visible
   ================================ */
async function keepYouTubeControlsVisible() {
    try {
        const [tab] = await chrome.tabs.query({
            active: true,
            lastFocusedWindow: true
        });
        if (!tab?.id || !tab.url.includes("youtube.com/watch")) return;
        await chrome.scripting.executeScript({
            target: {
                tabId: tab.id
            },
            func: () => {
                const player = document.getElementById("movie_player");
                if (!player) return;
                const rect = player.getBoundingClientRect();
                const x = rect.left + rect.width / 2;
                const y = rect.top + rect.height / 2;
                function simulateClickOrTouch() {
                    if (/Mobi|Android/i.test(navigator.userAgent)) {
                        // Mobile → simulate touch
                        const touchObj = new Touch({
                            identifier: Date.now(),
                            target: player,
                            clientX: x,
                            clientY: y,
                            radiusX: 2.5,
                            radiusY: 2.5,
                            rotationAngle: 0,
                            force: 1
                        });
                        const touchEvent = new TouchEvent("touchstart", {
                            bubbles: true,
                            cancelable: true,
                            touches: [touchObj],
                            changedTouches: [touchObj]
                        });
                        player.dispatchEvent(touchEvent);
                        const touchEnd = new TouchEvent("touchend", {
                            bubbles: true,
                            cancelable: true,
                            changedTouches: [touchObj]
                        });
                        player.dispatchEvent(touchEnd);
                    } else {
                        // PC → simulate mouse click
                        const evt = new MouseEvent("click", {
                            bubbles: true,
                            cancelable: true,
                            clientX: x,
                            clientY: y,
                            view: window
                        });
                        player.dispatchEvent(evt);
                    }
                }
                simulateClickOrTouch();
                // Wait 2 sec before screenshot (so controls fully visible)
                setTimeout(() => {
                    chrome.runtime.sendMessage({
                        type: "TAKE_SCREENSHOT_NOW"
                    });
                    // After screenshot, tap/click again to hide controls
                    setTimeout(() => simulateClickOrTouch(), 200);
                }, 2000);
            }
        });
    } catch (err) {
        console.error("Error keeping controls visible:", err);
    }
}
/* ================================
   🚨 Anti-cheating
   ================================ */
chrome.tabs.onCreated.addListener((tab) => {
    if (running && tab.url && tab.url.includes("youtube.com/watch") && !tab.active) {
        chrome.tabs.remove(tab.id, () => {
            console.log("[AutoScreenshot] Closed inactive YouTube tab (opened in background).");
            stopAll();
        });
    }
});
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    if (!running) return;
    const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
    });
    if (!activeTab) return;
    const ytTabs = await chrome.tabs.query({
        url: "*://*.youtube.com/watch*"
    });
    for (const ytTab of ytTabs) {
        if (ytTab.id !== activeTab.id) {
            chrome.tabs.remove(ytTab.id, () => {
                console.log("[AutoScreenshot] Closed YouTube tab because user switched away.");
                stopAll();
            });
        }
    }
});
