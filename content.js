// ===== content.js (REPLACE WHOLE FILE) =====
let overlayTimerEl = null;
let timerInterval = null;
let elapsed = 0;
// ---------- Overlay ----------
function createOverlay() {
    if (overlayTimerEl) return;
    overlayTimerEl = document.createElement("div");
    overlayTimerEl.id = "autoScreenshotTimerOverlay";
    overlayTimerEl.style.position = "fixed";
    overlayTimerEl.style.top = "10px";
    overlayTimerEl.style.left = "50%";
    overlayTimerEl.style.transform = "translateX(-50%)";
    overlayTimerEl.style.background = "rgba(0,0,0,0.6)";
    overlayTimerEl.style.color = "white";
    overlayTimerEl.style.padding = "8px 20px";
    overlayTimerEl.style.borderRadius = "8px";
    overlayTimerEl.style.fontFamily = "monospace";
    overlayTimerEl.style.fontSize = "20px";
    overlayTimerEl.style.fontWeight = "bold";
    overlayTimerEl.style.zIndex = "999999";
    overlayTimerEl.style.textAlign = "center";
    overlayTimerEl.innerText = "⏱ 00:00";
    document.body.appendChild(overlayTimerEl);
}
function formatTime(sec) {
    const m = String(Math.floor(sec / 60))
        .padStart(2, "0");
    const s = String(sec % 60)
        .padStart(2, "0");
    return `${m}:${s}`;
}
function startTimer() {
    createOverlay();
    elapsed = 0;
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        elapsed++;
        if (overlayTimerEl) overlayTimerEl.innerText = `⏱ ${formatTime(elapsed)}`;
    }, 1000);
}
function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    if (overlayTimerEl) {
        overlayTimerEl.remove();
        overlayTimerEl = null;
    }
}
// ---------- Video info (title/duration) ----------
// Detect device type
function detectDevice() {
    const ua = navigator.userAgent;
    if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) {
        return "Mobile";
    }
    return "Desktop";
}
// Get active <video> element safely
function getActiveVideo() {
    return document.querySelector("video");
}
// Get title & duration for both desktop and mobile
function saveVideoInfo() {
    let title = "";
    let duration = "";
    let channelName = "";
    const device = detectDevice();
    if (device === "Desktop") {
        // ----- Title -----
        const desktopTitleEl =
            document.querySelector("h1.title yt-formatted-string") ||
            document.querySelector("h1.ytd-video-primary-info-renderer") ||
            document.querySelector("yt-formatted-string.style-scope.ytd-video-primary-info-renderer");
        if (desktopTitleEl) title = desktopTitleEl.innerText.trim();
        // ----- Channel Name -----
        const desktopChannelEl =
            document.querySelector("#text-container.ytd-channel-name a") ||
            document.querySelector("#channel-name a") ||
            document.querySelector("ytd-channel-name yt-formatted-string a");
        if (desktopChannelEl) channelName = desktopChannelEl.innerText.trim();
    } else {
        // ----- Mobile -----
        const mobileTitleEl =
            document.querySelector("h1#title") ||
            document.querySelector("ytm-video-primary-info-renderer h1") ||
            document.querySelector(".slim-video-information-title") ||
            document.querySelector("yt-formatted-string");
        if (mobileTitleEl) title = mobileTitleEl.innerText.trim();
        const mobileChannelEl =
            document.querySelector("ytm-owner-renderer .yt-simple-endpoint") ||
            document.querySelector("ytm-owner-renderer a") ||
            document.querySelector("yt-formatted-string.ytm-owner-renderer");
        if (mobileChannelEl) channelName = mobileChannelEl.innerText.trim();
    }
    // ----- Duration -----
    const durationEl = document.querySelector(".ytp-time-duration");
    if (durationEl) {
        duration = durationEl.innerText.trim();
    } else {
        const v = getActiveVideo();
        if (v && isFinite(v.duration) && v.duration > 0) {
            const secs = Math.floor(v.duration);
            const m = String(Math.floor(secs / 60))
                .padStart(2, "0");
            const s = String(secs % 60)
                .padStart(2, "0");
            duration = `${m}:${s}`;
        }
    }
    // Save into chrome storage
    chrome.storage.local.set({
        videoTitle: title,
        videoDuration: duration,
        channelName: channelName,
        device: device
    });
}
setTimeout(saveVideoInfo, 5000);
const infoObserver = new MutationObserver(() => saveVideoInfo());
infoObserver.observe(document.body, {
    childList: true,
    subtree: true
});
// ---------- Robust video selection ----------
function getActiveVideo() {
    // Prefer YouTube’s main video element
    const main = document.querySelector("video.html5-main-video");
    if (main) return main;
    const vids = Array.from(document.querySelectorAll("video"));
    if (vids.length === 0) return null;
    if (vids.length === 1) return vids[0];
    // Prefer the one actually showing content
    const scored = vids.map(v => {
            const rect = v.getBoundingClientRect();
            const area = Math.max(0, rect.width) * Math.max(0, rect.height);
            const dur = isFinite(v.duration) ? v.duration : 0;
            const score = (dur > 0 ? 2 : 0) + (area > 0 ? 1 : 0) + (!v.paused ? 0.5 : 0);
            return {
                v,
                score
            };
        })
        .sort((a, b) => b.score - a.score);
    return (scored[0] && scored[0].v) || vids[0];
}
function getVideoIdFromUrl() {
    try {
        const u = new URL(location.href);
        if (u.hostname.includes("youtube.com")) return u.searchParams.get("v");
        if (u.hostname === "youtu.be") return u.pathname.replace("/", "");
    } catch (_) {}
    return null;
}
// ---------- Play/Stop tracking by progress ----------
let trackInterval = null;
let playSeconds = 0;
let stopSeconds = 0;
let lastCT = 0;
let lastCTTs = 0;
let currentVideoKey = null; // use videoId when possible
let uploadedAt85 = false;
let activeVideo = null;
function resetCountersForNewVideo(key) {
    playSeconds = 0;
    stopSeconds = 0;
    uploadedAt85 = false;
    currentVideoKey = key || null;
    chrome.storage.local.set({
        playSeconds,
        stopSeconds,
        currentVideoId: currentVideoKey,
        uploadedAt85: false
    });
}
function isAdPlaying() {
    const player = document.getElementById("movie_player");
    return player && player.classList.contains("ad-showing");
}
function startVideoTrackingForCurrentVideo() {
    const v = getActiveVideo();
    if (!v) return;
    const id = getVideoIdFromUrl() || (v.src || "unknown");
    if (currentVideoKey !== id) {
        resetCountersForNewVideo(id);
    }
    if (trackInterval) clearInterval(trackInterval);
    activeVideo = v;
    lastCT = v.currentTime || 0;
    lastCTTs = Date.now();
    trackInterval = setInterval(() => {
        if (!activeVideo || activeVideo !== getActiveVideo()) {
            // Video element swapped (ads → main or new video loaded)
            startVideoTrackingForCurrentVideo();
            return;
        }
        // --- Ad check ---
        if (isAdPlaying()) {
            console.log("[Tracker] Ad detected → pausing counting");
            // Do not reset anything, just skip this tick
            return;
        }
        const now = Date.now();
        const ct = activeVideo.currentTime || 0;
        const advanced = Math.abs(ct - lastCT) > 0.01;
        if (advanced) {
            playSeconds += 1;
            lastCT = ct;
            lastCTTs = now;
        } else {
            stopSeconds += 1;
        }
        chrome.storage.local.set({
            playSeconds,
            stopSeconds
        });
        // Auto-upload at 85%
        const durationSec = Math.floor(isFinite(activeVideo.duration) ? activeVideo.duration : 0);
        if (!uploadedAt85 && durationSec > 0) {
            const threshold = Math.floor(durationSec * 0.85);
            if (playSeconds >= threshold) {
                uploadedAt85 = true;
                chrome.storage.local.set({
                    uploadedAt85: true
                });
                chrome.runtime.sendMessage({
                    type: "UPLOAD_AT_85"
                });
            }
        }
    }, 1000);
}
// Auto-skip ads
// === Auto Skip Ads by Text ===
// === Auto Skip Ads (works for Skip, Skip Ad, Skip Ads) ===
function autoSkipAds() {
    // Grab all possible skip buttons
    const skipBtn = document.querySelector("button.ytp-skip-ad-button");
    if (skipBtn) {
        const text = skipBtn.innerText.trim()
            .toLowerCase();
        if (text.includes("skip")) {
            console.log("[AutoSkipAds] Clicking:", text);
            skipBtn.click();
        }
    }
}
// Run every second
setInterval(autoSkipAds, 1000);
// function startVideoTrackingForCurrentVideo() {
//   const v = getActiveVideo();
//   if (!v) return;
//   // Compute a stable key for the video (prefer ID)
//   const id = getVideoIdFromUrl() || (v.src || "unknown");
//   if (currentVideoKey !== id) {
//     resetCountersForNewVideo(id);
//   }
//   // Clean previous interval
//   if (trackInterval) clearInterval(trackInterval);
//   activeVideo = v;
//   lastCT = v.currentTime || 0;
//   lastCTTs = Date.now();
//   // Count every REAL second based on whether currentTime advanced since last tick
//   trackInterval = setInterval(() => {
//     if (!activeVideo || activeVideo !== getActiveVideo()) {
//       // Video element swapped (e.g., ad finished); restart tracking on new element
//       startVideoTrackingForCurrentVideo();
//       return;
//     }
//     const now = Date.now();
//     const ct = activeVideo.currentTime || 0;
//     // If currentTime moved even a little, treat as playing this second.
//     // Tiny epsilon to avoid float jitter.
//     const advanced = Math.abs(ct - lastCT) > 0.01;
//     if (advanced) {
//       playSeconds += 1;
//       lastCT = ct;
//       lastCTTs = now;
//     } else {
//       // No progress in the last second -> paused/stalled/buffering
//       stopSeconds += 1;
//     }
//     chrome.storage.local.set({ playSeconds, stopSeconds });
//     // Auto-upload at 85% played (real-time watched), once per video
//     const durationSec = Math.floor(isFinite(activeVideo.duration) ? activeVideo.duration : 0);
//     if (!uploadedAt85 && durationSec > 0) {
//       const threshold = Math.floor(durationSec * 0.85);
//       if (playSeconds >= threshold) {
//         uploadedAt85 = true;
//         chrome.storage.local.set({ uploadedAt85: true });
//         chrome.runtime.sendMessage({ type: "UPLOAD_AT_85" });
//       }
//     }
//   }, 1000);
// }
// Listen for navigation changes on YouTube’s SPA
window.addEventListener("yt-navigate-finish", () => {
    saveVideoInfo();
    startVideoTrackingForCurrentVideo();
});
// Also watch big DOM swaps (fallback)
const swapObserver = new MutationObserver(() => {
    // If the main video element changes (ads → main), rebind
    const v = getActiveVideo();
    if (v && v !== activeVideo) {
        startVideoTrackingForCurrentVideo();
    }
});
swapObserver.observe(document.body, {
    childList: true,
    subtree: true
});
// Messages from background
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "TIMER_START") {
        startTimer();
        startVideoTrackingForCurrentVideo();
        chrome.runtime.sendMessage({
            type: "FORCE_RUNNING"
        });
    }
    if (msg.type === "TIMER_STOP") {
        stopTimer();
        if (trackInterval) clearInterval(trackInterval);
        trackInterval = null;
    }
    if (msg.type === "RESET_ALL_TIMERS") {
        stopTimer(); // stop overlay timer
        elapsed = 0; // reset overlay counter
        if (trackInterval) { // stop play/stop tracking
            clearInterval(trackInterval);
            trackInterval = null;
        }
        playSeconds = 0;
        stopSeconds = 0;
        uploadedAt85 = false;
        chrome.storage.local.set({
            playSeconds: 0,
            stopSeconds: 0,
            uploadedAt85: false
        });
    }
});
// If tab is closed, notify background to stop everything
window.addEventListener("beforeunload", () => {
    chrome.runtime.sendMessage({
        type: "TIMER_STOP"
    }); // ensure timers are stopped
    chrome.runtime.sendMessage({
        type: "TAB_CLOSED"
    }); // notify background
});
// ---------- Anti-cheat: detect visibility changes ----------      
// Visibility / focus detection => violation should close tab
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') {
        // Violation: lost focus or minimized
        handleViolation('visibility_lost');
    }
});
// handle violation: ask background to close tab
function handleViolation(kind) {
    //resetCountersForNewVideo(id);
    // notify background to close this tab (may not be supported)
    chrome.runtime.sendMessage({
        type: 'closeTab',
        tabId: null
    }, resp => {
        // Some browsers require explicit tabId. As fallback, request activeTab and close by id.
        if (resp && resp.success) return;
        // fallback: query active tab and close it
        chrome.tabs && chrome.tabs.query ?
            chrome.tabs.query({
                active: true,
                currentWindow: true
            }, tabs => {
                if (tabs && tabs[0] && tabs[0].id) {
                    chrome.runtime.sendMessage({
                        type: 'closeTab',
                        tabId: tabs[0].id
                    });
                }
            }) :
            null;
    });
}
