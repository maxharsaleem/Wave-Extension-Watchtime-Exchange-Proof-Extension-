const enabledEl = document.getElementById("enabled");
const showImagesEl = document.getElementById("showImages");
const channelHandleEl = document.getElementById("channelHandle");
const resetHandleBtn = document.getElementById("resetHandle");
const videoTitleEl = document.getElementById("videoTitle");
const videoDurationEl = document.getElementById("videoDuration");
const playSecondsEl = document.getElementById("playSeconds");
const stopSecondsEl = document.getElementById("stopSeconds");
const modePlaylistEl = document.getElementById("modePlaylist");
const modeVideoSearchEl = document.getElementById("modeVideoSearch");
chrome.storage.local.get({
        enabled: false,
        showImages: false,
        channelHandle: "",
        videoTitle: "",
        videoDuration: "",
        playSeconds: 0,
        stopSeconds: 0,
        mode: "playlist"
    },
    (res) => {
        enabledEl.checked = res.enabled;
        showImagesEl.checked = res.showImages;
        channelHandleEl.value = res.channelHandle;
        videoTitleEl.value = res.videoTitle || "";
        videoDurationEl.value = res.videoDuration || "";
        playSecondsEl.value = res.playSeconds || 0;
        stopSecondsEl.value = res.stopSeconds || 0;
        if (res.mode === "playlist") modePlaylistEl.checked = true;
        else modeVideoSearchEl.checked = true;
    }
);
enabledEl.addEventListener("change", () => chrome.storage.local.set({
    enabled: enabledEl.checked
}));
showImagesEl.addEventListener("change", () => chrome.storage.local.set({
    showImages: showImagesEl.checked
}));
channelHandleEl.addEventListener("change", () => chrome.storage.local.set({
    channelHandle: channelHandleEl.value
}));
resetHandleBtn.addEventListener("click", () => chrome.storage.local.set({
    channelHandle: ""
}, () => {
    channelHandleEl.value = "";
}));
// Mode toggle (radio buttons)
modePlaylistEl.addEventListener("change", () => {
    if (modePlaylistEl.checked) chrome.storage.local.set({
        mode: "playlist"
    });
});
modeVideoSearchEl.addEventListener("change", () => {
    if (modeVideoSearchEl.checked) chrome.storage.local.set({
        mode: "videoSearch"
    });
});
// live updates
chrome.storage.onChanged.addListener((changes) => {
    if (changes.videoTitle) videoTitleEl.value = changes.videoTitle.newValue || "";
    if (changes.videoDuration) videoDurationEl.value = changes.videoDuration.newValue || "";
    if (changes.playSeconds) playSecondsEl.value = changes.playSeconds.newValue || 0;
    if (changes.stopSeconds) stopSecondsEl.value = changes.stopSeconds.newValue || 0;
});
