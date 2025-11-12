const statusText = document.getElementById("statusText");
const photoList = document.getElementById("photoList");
function renderPhotos(photos) {
    photoList.innerHTML = "";
    chrome.storage.local.get({
        showImages: true
    }, (cfg) => {
        if (!cfg.showImages) return;
        photos.forEach((p) => {
            const img = document.createElement("img");
            img.src = p.url;
            photoList.appendChild(img);
        });
    });
}
async function refresh() {
    try {
        const res = await chrome.runtime.sendMessage({
            type: "GET_STATE"
        });
        if (res?.ok) {
            const {
                running,
                enabled
            } = res.state;
            if (!enabled) {
                statusText.textContent = "Extension OFF";
                statusText.style.color = "red";
            } else if (running) {
                statusText.textContent = "Capturing…";
                statusText.style.color = "green";
            } else {
                statusText.textContent = "Enabled (waiting for YouTube)";
                statusText.style.color = "orange";
            }
        }
    } catch (e) {}
    chrome.storage.local.get({
        photos: []
    }, (cfg) => {
        renderPhotos(cfg.photos);
    });
}
chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "STATE_UPDATED") {
        renderPhotos(msg.payload.photos || []);
    }
});
refresh();
