const STORAGE_KEY = "photo-buy-list-v1";
const VIEW_MODE_KEY = "photo-buy-list-view-mode-v1";
const API_ITEMS_URL = "./api/items";
const API_STATUS_URL = "./api/status";
const DEFAULT_CATEGORIES = ["食品", "日用品", "家電", "衣類", "薬・ケア", "その他"];
const OFFLINE_BUILD = Boolean(globalThis.HOSHIIMONO_OFFLINE_BUILD) || location.protocol === "file:";

const elements = {
  form: document.querySelector("#item-form"),
  formTitle: document.querySelector("#form-title"),
  preview: document.querySelector("#preview-image"),
  photoCamera: document.querySelector("#photo-camera"),
  photoLibrary: document.querySelector("#photo-library"),
  photoUrl: document.querySelector("#photo-url"),
  name: document.querySelector("#item-name"),
  price: document.querySelector("#item-price"),
  store: document.querySelector("#item-store"),
  category: document.querySelector("#item-category"),
  priority: document.querySelector("#item-priority"),
  note: document.querySelector("#item-note"),
  needed: document.querySelector("#item-needed"),
  done: document.querySelector("#item-done"),
  resetForm: document.querySelector("#reset-form"),
  focusForm: document.querySelector("#focus-form"),
  search: document.querySelector("#search-input"),
  filter: document.querySelector("#filter-select"),
  categoryFilter: document.querySelector("#category-filter"),
  sort: document.querySelector("#sort-select"),
  listSummary: document.querySelector("#list-summary"),
  viewList: document.querySelector("#view-list"),
  viewGallery: document.querySelector("#view-gallery"),
  openCount: document.querySelector("#open-count"),
  openTotal: document.querySelector("#open-total"),
  doneCount: document.querySelector("#done-count"),
  items: document.querySelector("#items"),
  empty: document.querySelector("#empty-list"),
  template: document.querySelector("#item-template"),
  copy: document.querySelector("#copy-list"),
  export: document.querySelector("#export-list"),
  import: document.querySelector("#import-list"),
  importFile: document.querySelector("#import-file"),
  syncStatus: document.querySelector("#sync-status"),
  detailModal: document.querySelector("#detail-modal"),
  detailPhoto: document.querySelector("#detail-photo"),
  detailPhotoEmpty: document.querySelector("#detail-photo-empty"),
  detailMeta: document.querySelector("#detail-meta"),
  detailName: document.querySelector("#detail-name"),
  detailPrice: document.querySelector("#detail-price"),
  detailStore: document.querySelector("#detail-store"),
  detailStatus: document.querySelector("#detail-status"),
  detailCreated: document.querySelector("#detail-created"),
  detailNote: document.querySelector("#detail-note"),
  detailClose: document.querySelector("#detail-close"),
  detailOk: document.querySelector("#detail-ok"),
  detailEdit: document.querySelector("#detail-edit"),
  cropModal: document.querySelector("#crop-modal"),
  cropCanvas: document.querySelector("#crop-canvas"),
  cropZoom: document.querySelector("#crop-zoom"),
  cropApply: document.querySelector("#crop-apply"),
  cropCancel: document.querySelector("#crop-cancel"),
  cropReset: document.querySelector("#crop-reset"),
};

let items = [];
let editingId = "";
let currentPhoto = "";
let detailItemId = "";
let syncMode = "browser";
let syncDetail = "この端末のブラウザに保存中";
let syncLabel = "端末保存";
let cropState = null;
let viewMode = loadViewMode();

initialize();
registerServiceWorker();
ensureDetailModalStyle();
setActionLabels();

on(elements.photoCamera, "change", () => handlePhotoFile(elements.photoCamera));
on(elements.photoLibrary, "change", () => handlePhotoFile(elements.photoLibrary, { crop: true }));
on(elements.cropApply, "click", applyCrop);
on(elements.cropCancel, "click", cancelCrop);
on(elements.cropReset, "click", resetCropView);
on(elements.cropZoom, "input", updateCropZoom);
on(elements.cropCanvas, "pointerdown", startCropDrag);
on(elements.cropCanvas, "pointermove", moveCropDrag);
on(elements.cropCanvas, "pointerup", endCropDrag);
on(elements.cropCanvas, "pointercancel", endCropDrag);
on(elements.detailClose, "click", closeDetail);
on(elements.detailOk, "click", closeDetail);
on(elements.detailEdit, "click", editDetailItem);
on(elements.detailModal, "click", (event) => {
  if (event.target === elements.detailModal) {
    closeDetail();
  }
});
on(document, "keydown", (event) => {
  if (event.key === "Escape" && elements.detailModal && !elements.detailModal.hidden) {
    closeDetail();
  }
});

on(elements.photoUrl, "input", () => {
  currentPhoto = elements.photoUrl.value.trim();
  updatePreview();
});

on(elements.form, "submit", async (event) => {
  event.preventDefault();

  const rawName = elements.name.value.trim();
  const rawPrice = elements.price.value.trim();
  const rawStore = elements.store.value.trim();
  const rawNote = elements.note.value.trim();
  const hasAnyContent = Boolean(rawName || rawPrice || rawStore || rawNote || currentPhoto);
  const price = rawPrice === "" ? 0 : Number(rawPrice);

  if (!hasAnyContent || Number.isNaN(price)) {
    window.alert("写真だけでも保存できます。写真、商品名、金額、購入先、メモのいずれかを入力してください。");
    return;
  }

  const item = {
    id: editingId || createId(),
    name: rawName || autoPhotoName(),
    price,
    store: rawStore || "未入力",
    category: elements.category.value,
    priority: Number(elements.priority.value),
    note: rawNote,
    needed: elements.needed.checked,
    done: elements.done.checked,
    photo: currentPhoto,
    createdAt: editingId ? findItem(editingId)?.createdAt || Date.now() : Date.now(),
  };

  if (editingId) {
    items = items.map((current) => (current.id === editingId ? item : current));
  } else {
    items.unshift(item);
  }

  await saveItems();
  resetForm();
  render();
});

on(elements.resetForm, "click", resetForm);
on(elements.focusForm, "click", () => {
  resetForm();
  elements.name?.focus();
});

[elements.search, elements.filter, elements.categoryFilter, elements.sort].filter(Boolean).forEach((control) => {
  on(control, "input", render);
  on(control, "change", render);
});

on(elements.viewList, "click", () => setViewMode("list"));
on(elements.viewGallery, "click", () => setViewMode("gallery"));

on(elements.copy, "click", async () => {
  const shoppingItems = items.filter((item) => item.needed && !item.done);
  const text = shoppingItems
    .sort(compareByStoreThenPriority)
    .map((item) => `${item.store}: ${item.name} ${formatYen(item.price)}`)
    .join("\n");

  if (!text) {
    window.alert("コピーできる買い物リストがありません。");
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    window.alert("買い物リストをコピーしました。");
  } catch {
    window.prompt("コピーしてください", text);
  }
});

on(elements.export, "click", () => {
  const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `hoshiimono-note-${formatDate(new Date())}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
});

on(elements.import, "click", () => elements.importFile?.click());

on(elements.importFile, "change", async () => {
  const [file] = elements.importFile.files || [];
  if (!file) return;

  try {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed)) throw new Error("Invalid JSON");

    items = parsed.filter(isValidItem).map((item) => ({
      id: item.id || createId(),
      name: String(item.name),
      price: Number(item.price) || 0,
      store: String(item.store),
      category: String(item.category || "その他"),
      priority: Number(item.priority) || 2,
      note: String(item.note || ""),
      needed: Boolean(item.needed),
      done: Boolean(item.done),
      photo: String(item.photo || ""),
      createdAt: Number(item.createdAt) || Date.now(),
    }));
    await saveItems();
    render();
  } catch {
    window.alert("読み込みに失敗しました。このアプリで保存したJSONを選んでください。");
  } finally {
    elements.importFile.value = "";
  }
});

async function initialize() {
  await refreshSyncStatus();
  items = await loadItems();

  if (!items.length) {
    items = createSampleItems();
    await saveItems();
  } else {
    await saveItems();
  }

  render();
}

function render() {
  setActionLabels();
  renderCategoryOptions();
  renderViewMode();
  renderStats();
  renderList();
  renderSyncStatus();
}

function setActionLabels() {
  const submitButton = elements.form?.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.textContent = editingId ? "変更を保存" : "リストに追加";
  }
  if (elements.export) {
    elements.export.textContent = "書き出し";
    elements.export.title = "リストをJSONファイルとして保存";
  }
}

function renderCategoryOptions() {
  if (!elements.categoryFilter) return;

  const currentValue = elements.categoryFilter.value || "all";
  const categories = Array.from(
    new Set([...DEFAULT_CATEGORIES, ...items.map((item) => item.category).filter(Boolean)]),
  );

  elements.categoryFilter.innerHTML = "";
  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "すべて";
  elements.categoryFilter.append(allOption);

  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    elements.categoryFilter.append(option);
  });

  elements.categoryFilter.value = categories.includes(currentValue) ? currentValue : "all";
}

function renderViewMode() {
  elements.items?.classList.toggle("is-gallery", viewMode === "gallery");
  elements.viewList?.classList.toggle("is-active", viewMode === "list");
  elements.viewGallery?.classList.toggle("is-active", viewMode === "gallery");
  elements.viewList?.setAttribute("aria-pressed", String(viewMode === "list"));
  elements.viewGallery?.setAttribute("aria-pressed", String(viewMode === "gallery"));
}

function renderStats() {
  if (!elements.openCount || !elements.openTotal || !elements.doneCount) return;

  const openItems = items.filter((item) => item.needed && !item.done);
  const doneItems = items.filter((item) => item.done);
  const total = openItems.reduce((sum, item) => sum + item.price, 0);

  elements.openCount.textContent = `${openItems.length}件`;
  elements.openTotal.textContent = formatYen(total);
  elements.doneCount.textContent = `${doneItems.length}件`;
}

function renderList() {
  if (!elements.items || !elements.template || !elements.empty) return;

  const visibleItems = getVisibleItems();
  elements.items.innerHTML = "";
  elements.items.classList.toggle("is-gallery", viewMode === "gallery");
  elements.empty.hidden = visibleItems.length > 0;
  if (elements.listSummary) {
    elements.listSummary.textContent = `${visibleItems.length}件 / 全${items.length}件`;
  }

  visibleItems.forEach((item) => {
    const node = elements.template.content.cloneNode(true);
    const card = node.querySelector(".item-card");
    const photo = node.querySelector(".item-photo");
    const meta = node.querySelector(".item-meta");
    const name = node.querySelector(".item-name");
    const price = node.querySelector(".item-price");
    const store = node.querySelector(".item-store");
    const note = node.querySelector(".item-note");
    const neededToggle = node.querySelector(".needed-toggle");
    const doneToggle = node.querySelector(".done-toggle");
    const editButton = node.querySelector(".edit-item");
    const deleteButton = node.querySelector(".delete-item");
    const detailButton = document.createElement("button");

    card.classList.toggle("is-later", !item.needed);
    card.classList.toggle("is-done", item.done);
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `${item.name}の詳細を開く`);
    photo.src = item.photo || "";
    photo.alt = item.photo ? `${item.name}の写真` : "";
    meta.textContent = `${item.category} / ${priorityText(item.priority)}`;
    name.textContent = item.name;
    price.textContent = formatYen(item.price);
    store.textContent = `${item.store}で購入予定`;
    note.textContent = item.note;
    neededToggle.checked = item.needed;
    doneToggle.checked = item.done;
    detailButton.className = "secondary-button detail-item";
    detailButton.type = "button";
    detailButton.textContent = "DETAIL";
    detailButton.setAttribute("aria-label", `${item.name}の詳細を開く`);
    editButton.before(detailButton);

    card.addEventListener("click", (event) => {
      if (isInteractiveTap(event.target)) return;
      openDetail(item.id);
    });
    card.addEventListener("keydown", (event) => {
      if (isInteractiveTap(event.target)) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openDetail(item.id);
    });
    neededToggle.addEventListener("change", () => updateItem(item.id, { needed: neededToggle.checked }));
    doneToggle.addEventListener("change", () => updateItem(item.id, { done: doneToggle.checked }));
    detailButton.addEventListener("click", () => openDetail(item.id));
    editButton.addEventListener("click", () => editItem(item.id));
    deleteButton.addEventListener("click", () => deleteItem(item.id));

    elements.items.append(node);
  });
}

function getVisibleItems() {
  const query = elements.search.value.trim().toLowerCase();
  const filter = elements.filter.value;
  const category = elements.categoryFilter?.value || "all";
  const sort = elements.sort.value;

  return items
    .filter((item) => {
      const text = `${item.name} ${item.store} ${item.category} ${item.note}`.toLowerCase();
      const matchesQuery = !query || text.includes(query);
      const matchesFilter =
        filter === "all" ||
        (filter === "shopping" && item.needed && !item.done) ||
        (filter === "needed" && item.needed) ||
        (filter === "later" && !item.needed) ||
        (filter === "done" && item.done);
      const matchesCategory = category === "all" || item.category === category;
      return matchesQuery && matchesFilter && matchesCategory;
    })
    .sort((left, right) => {
      if (sort === "store") return compareByStoreThenPriority(left, right);
      if (sort === "price-desc") return right.price - left.price;
      if (sort === "price-asc") return left.price - right.price;
      if (sort === "newest") return right.createdAt - left.createdAt;
      return right.priority - left.priority || right.createdAt - left.createdAt;
    });
}

function isInteractiveTap(target) {
  return target instanceof Element && Boolean(target.closest("button, input, label, select, textarea, a"));
}

async function updateItem(id, patch) {
  items = items.map((item) => (item.id === id ? { ...item, ...patch } : item));
  await saveItems();
  render();
}

function editItem(id) {
  const item = findItem(id);
  if (!item) return;

  editingId = id;
  elements.formTitle.textContent = "買うものを編集";
  elements.name.value = item.name;
  elements.price.value = item.price;
  elements.store.value = item.store;
  elements.category.value = item.category;
  elements.priority.value = String(item.priority);
  elements.note.value = item.note;
  elements.needed.checked = item.needed;
  elements.done.checked = item.done;
  currentPhoto = item.photo || "";
  elements.photoUrl.value = currentPhoto.startsWith("http") ? currentPhoto : "";
  elements.photoCamera.value = "";
  elements.photoLibrary.value = "";
  updatePreview();
  setActionLabels();
  elements.name.focus();
}

async function deleteItem(id) {
  items = items.filter((item) => item.id !== id);
  await saveItems();
  render();
}

function openDetail(id) {
  const item = findItem(id);
  if (!item || !elements.detailModal) return;

  detailItemId = id;
  if (elements.detailPhoto) {
    if (item.photo) {
      elements.detailPhoto.src = item.photo;
      elements.detailPhoto.alt = `${item.name}の写真`;
    } else {
      elements.detailPhoto.removeAttribute("src");
      elements.detailPhoto.alt = "";
    }
  }
  if (elements.detailMeta) elements.detailMeta.textContent = `${item.category} / ${priorityText(item.priority)}`;
  if (elements.detailName) elements.detailName.textContent = item.name;
  if (elements.detailPrice) elements.detailPrice.textContent = formatYen(item.price);
  if (elements.detailStore) elements.detailStore.textContent = item.store;
  if (elements.detailStatus) elements.detailStatus.textContent = detailStatusText(item);
  if (elements.detailCreated) elements.detailCreated.textContent = formatShortDate(item.createdAt);
  if (elements.detailNote) elements.detailNote.textContent = item.note || "メモなし";

  elements.detailModal.hidden = false;
}

function closeDetail() {
  if (elements.detailModal) elements.detailModal.hidden = true;
  detailItemId = "";
}

function editDetailItem() {
  const id = detailItemId;
  closeDetail();
  if (id) editItem(id);
}

function detailStatusText(item) {
  if (item.done) return "購入済み";
  if (item.needed) return "買う予定";
  return "後で検討";
}

function setViewMode(nextMode) {
  viewMode = nextMode === "gallery" ? "gallery" : "list";
  localStorage.setItem(VIEW_MODE_KEY, viewMode);
  render();
}

function loadViewMode() {
  try {
    return localStorage.getItem(VIEW_MODE_KEY) === "gallery" ? "gallery" : "list";
  } catch {
    return "list";
  }
}

function ensureDetailModalStyle() {
  if (document.querySelector("#detail-modal-runtime-style")) return;

  const style = document.createElement("style");
  style.id = "detail-modal-runtime-style";
  style.textContent = `
    #detail-modal.detail-modal {
      position: fixed !important;
      inset: 0 !important;
      z-index: 9999 !important;
      display: grid !important;
      align-items: end !important;
      justify-items: center !important;
      padding: 10px !important;
      background: rgba(0, 0, 0, 0.76) !important;
      backdrop-filter: blur(8px);
    }
    #detail-modal.detail-modal[hidden] {
      display: none !important;
    }
    #detail-modal .detail-panel {
      display: grid !important;
      grid-template-columns: minmax(120px, 38%) minmax(0, 1fr) !important;
      width: min(98vw, 680px) !important;
      max-height: 84vh !important;
      overflow: hidden !important;
      border: 1px solid rgba(80, 255, 231, 0.56) !important;
      border-radius: 8px 8px 4px 4px !important;
      background: linear-gradient(180deg, rgba(15, 22, 39, 0.99), rgba(6, 10, 20, 0.99)) !important;
      box-shadow: 0 0 52px rgba(80, 255, 231, 0.22), 0 0 38px rgba(255, 57, 195, 0.16) !important;
    }
    #detail-modal .detail-visual,
    #detail-modal .detail-photo {
      min-height: 150px !important;
    }
    #detail-modal .detail-body {
      min-width: 0 !important;
      overflow: auto !important;
    }
    @media (max-width: 430px) {
      #detail-modal .detail-panel {
        grid-template-columns: 1fr !important;
        max-height: 88vh !important;
      }
      #detail-modal .detail-visual,
      #detail-modal .detail-photo {
        min-height: 130px !important;
        max-height: 34vh !important;
      }
    }
  `;
  document.head.append(style);
}

function resetForm() {
  elements.form?.reset();
  editingId = "";
  currentPhoto = "";
  if (elements.formTitle) elements.formTitle.textContent = "買うものを追加";
  if (elements.priority) elements.priority.value = "2";
  if (elements.needed) elements.needed.checked = true;
  if (elements.done) elements.done.checked = false;
  elements.preview?.removeAttribute("src");
  setActionLabels();
}

function updatePreview() {
  if (!elements.preview) return;

  if (currentPhoto) {
    elements.preview.src = currentPhoto;
  } else {
    elements.preview.removeAttribute("src");
  }
}

async function handlePhotoFile(input, options = {}) {
  const [file] = input.files || [];
  if (!file) return;

  const dataUrl = await fileToDataUrl(file);
  if (options.crop && canCrop()) {
    await openCropper(dataUrl);
    return;
  }

  currentPhoto = dataUrl;
  elements.photoUrl.value = "";

  if (input !== elements.photoCamera) {
    elements.photoCamera.value = "";
  }
  if (input !== elements.photoLibrary) {
    elements.photoLibrary.value = "";
  }

  updatePreview();
}

async function openCropper(dataUrl) {
  if (!canCrop()) {
    currentPhoto = dataUrl;
    updatePreview();
    return;
  }

  const image = await loadImage(dataUrl);
  const canvas = elements.cropCanvas;
  const minScale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);

  cropState = {
    image,
    minScale,
    scale: minScale,
    offsetX: (canvas.width - image.naturalWidth * minScale) / 2,
    offsetY: (canvas.height - image.naturalHeight * minScale) / 2,
    dragging: false,
    lastX: 0,
    lastY: 0,
  };

  elements.cropZoom.value = "100";
  elements.cropModal.hidden = false;
  drawCropCanvas();
}

function drawCropCanvas() {
  if (!cropState) return;

  const canvas = elements.cropCanvas;
  const context = canvas.getContext("2d");
  const width = cropState.image.naturalWidth * cropState.scale;
  const height = cropState.image.naturalHeight * cropState.scale;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#06070d";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(cropState.image, cropState.offsetX, cropState.offsetY, width, height);

  context.strokeStyle = "rgba(80, 255, 231, 0.9)";
  context.lineWidth = 4;
  context.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
  context.strokeStyle = "rgba(255, 57, 195, 0.55)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(canvas.width / 3, 0);
  context.lineTo(canvas.width / 3, canvas.height);
  context.moveTo((canvas.width / 3) * 2, 0);
  context.lineTo((canvas.width / 3) * 2, canvas.height);
  context.moveTo(0, canvas.height / 3);
  context.lineTo(canvas.width, canvas.height / 3);
  context.moveTo(0, (canvas.height / 3) * 2);
  context.lineTo(canvas.width, (canvas.height / 3) * 2);
  context.stroke();
}

function updateCropZoom() {
  if (!cropState) return;

  const canvas = elements.cropCanvas;
  const previousScale = cropState.scale;
  const nextScale = cropState.minScale * (Number(elements.cropZoom.value) / 100);
  const centerX = (canvas.width / 2 - cropState.offsetX) / previousScale;
  const centerY = (canvas.height / 2 - cropState.offsetY) / previousScale;

  cropState.scale = nextScale;
  cropState.offsetX = canvas.width / 2 - centerX * nextScale;
  cropState.offsetY = canvas.height / 2 - centerY * nextScale;
  clampCropOffset();
  drawCropCanvas();
}

function resetCropView() {
  if (!cropState) return;

  const canvas = elements.cropCanvas;
  cropState.scale = cropState.minScale;
  cropState.offsetX = (canvas.width - cropState.image.naturalWidth * cropState.scale) / 2;
  cropState.offsetY = (canvas.height - cropState.image.naturalHeight * cropState.scale) / 2;
  elements.cropZoom.value = "100";
  drawCropCanvas();
}

function startCropDrag(event) {
  if (!cropState) return;

  cropState.dragging = true;
  cropState.lastX = event.clientX;
  cropState.lastY = event.clientY;
  elements.cropCanvas.setPointerCapture(event.pointerId);
}

function moveCropDrag(event) {
  if (!cropState || !cropState.dragging) return;

  cropState.offsetX += event.clientX - cropState.lastX;
  cropState.offsetY += event.clientY - cropState.lastY;
  cropState.lastX = event.clientX;
  cropState.lastY = event.clientY;
  clampCropOffset();
  drawCropCanvas();
}

function endCropDrag(event) {
  if (!cropState) return;

  cropState.dragging = false;
  if (elements.cropCanvas.hasPointerCapture(event.pointerId)) {
    elements.cropCanvas.releasePointerCapture(event.pointerId);
  }
}

function clampCropOffset() {
  if (!cropState) return;

  const canvas = elements.cropCanvas;
  const width = cropState.image.naturalWidth * cropState.scale;
  const height = cropState.image.naturalHeight * cropState.scale;
  const minX = Math.min(0, canvas.width - width);
  const minY = Math.min(0, canvas.height - height);
  const maxX = Math.max(0, canvas.width - width);
  const maxY = Math.max(0, canvas.height - height);

  cropState.offsetX = Math.min(maxX, Math.max(minX, cropState.offsetX));
  cropState.offsetY = Math.min(maxY, Math.max(minY, cropState.offsetY));
}

function applyCrop() {
  if (!cropState) return;

  currentPhoto = elements.cropCanvas.toDataURL("image/jpeg", 0.9);
  if (elements.photoUrl) elements.photoUrl.value = "";
  if (elements.photoCamera) elements.photoCamera.value = "";
  if (elements.photoLibrary) elements.photoLibrary.value = "";
  closeCropper();
  updatePreview();
}

function cancelCrop() {
  if (elements.photoLibrary) elements.photoLibrary.value = "";
  closeCropper();
}

function closeCropper() {
  if (elements.cropModal) elements.cropModal.hidden = true;
  cropState = null;
}

function canCrop() {
  return Boolean(
    elements.cropModal &&
      elements.cropCanvas &&
      elements.cropZoom &&
      elements.cropApply &&
      elements.cropCancel &&
      elements.cropReset,
  );
}

function findItem(id) {
  return items.find((item) => item.id === id);
}

async function loadItems() {
  const apiItems = await loadItemsFromApi();
  if (apiItems) {
    const browserItems = loadItemsFromBrowser();
    if (!apiItems.length && browserItems.length) {
      return browserItems;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(apiItems));
    return apiItems;
  }

  return loadItemsFromBrowser();
}

function loadItemsFromBrowser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  if (OFFLINE_BUILD || syncMode !== "api") {
    return;
  }

  try {
    const response = await fetch(API_ITEMS_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(items),
    });
    if (!response.ok) {
      throw new Error("API save failed");
    }
  } catch {
    syncMode = "browser";
    syncLabel = "端末保存";
    syncDetail = "共有保存に失敗。ブラウザ内に保存中";
    renderSyncStatus();
  }
}

async function loadItemsFromApi() {
  if (OFFLINE_BUILD) {
    return null;
  }

  try {
    const response = await fetch(API_ITEMS_URL, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    const parsed = await response.json();
    if (!Array.isArray(parsed)) {
      return null;
    }
    syncMode = "api";
    return parsed;
  } catch {
    syncMode = "browser";
    return null;
  }
}

async function refreshSyncStatus() {
  if (OFFLINE_BUILD) {
    syncMode = "browser";
    syncLabel = "スマホ端末保存";
    syncDetail = "このHTMLファイルを開いたブラウザ内に保存中";
    return;
  }

  try {
    const response = await fetch(API_STATUS_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("status unavailable");
    }
    const status = await response.json();
    syncMode = "api";
    syncLabel = status.googleDrive ? "Google Drive同期ON" : "ローカル共有ON";
    syncDetail = `${syncLabel}: ${status.dataFile}`;
  } catch {
    syncMode = "browser";
    syncLabel = "端末保存";
    syncDetail = "この端末のブラウザに保存中";
  }
}

function renderSyncStatus() {
  if (!elements.syncStatus) {
    return;
  }
  elements.syncStatus.textContent = syncLabel;
  elements.syncStatus.title = syncDetail;
  elements.syncStatus.dataset.mode = syncMode;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", reject);
    reader.readAsDataURL(file);
  });
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", reject);
    image.src = source;
  });
}

function isValidItem(item) {
  return Boolean(
    item &&
      typeof item.name === "string" &&
      typeof item.store === "string" &&
      Number(item.price) >= 0,
  );
}

function compareByStoreThenPriority(left, right) {
  return left.store.localeCompare(right.store, "ja") || right.priority - left.priority;
}

function formatYen(value) {
  return `${new Intl.NumberFormat("ja-JP").format(Number(value) || 0)}円`;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShortDate(timestamp) {
  const date = new Date(Number(timestamp) || Date.now());
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function autoPhotoName() {
  const now = new Date();
  const hours = `${now.getHours()}`.padStart(2, "0");
  const minutes = `${now.getMinutes()}`.padStart(2, "0");
  return `写真メモ ${formatDate(now)} ${hours}:${minutes}`;
}

function priorityText(priority) {
  if (Number(priority) >= 3) return "優先度 高";
  if (Number(priority) === 2) return "優先度 中";
  return "優先度 低";
}

function createId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createSampleItems() {
  const now = Date.now();
  return [
    {
      id: createId(),
      name: "牛乳 1L",
      price: 238,
      store: "スーパー",
      category: "食品",
      priority: 3,
      note: "冷蔵庫の残りが少ない。帰り道で買う。",
      needed: true,
      done: false,
      photo: samplePhoto("#245d63", "#dceceb", "牛乳"),
      createdAt: now - 300000,
    },
    {
      id: createId(),
      name: "USB-C充電ケーブル",
      price: 1280,
      store: "Amazon",
      category: "家電",
      priority: 2,
      note: "2m以上。寝室用。",
      needed: true,
      done: false,
      photo: samplePhoto("#3b4a68", "#e8edf6", "ケーブル"),
      createdAt: now - 200000,
    },
    {
      id: createId(),
      name: "洗濯洗剤 詰め替え",
      price: 980,
      store: "ドラッグストア",
      category: "日用品",
      priority: 1,
      note: "セールなら買う。急ぎではない。",
      needed: false,
      done: false,
      photo: samplePhoto("#a16207", "#fff2d8", "洗剤"),
      createdAt: now - 100000,
    },
  ];
}

function samplePhoto(primary, background, label) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360">
      <rect width="480" height="360" fill="${background}"/>
      <circle cx="390" cy="68" r="94" fill="${primary}" opacity=".14"/>
      <circle cx="90" cy="310" r="84" fill="${primary}" opacity=".1"/>
      <rect x="92" y="72" width="296" height="216" rx="28" fill="white" opacity=".9"/>
      <rect x="126" y="116" width="228" height="128" rx="22" fill="${primary}" opacity=".94"/>
      <text x="240" y="196" text-anchor="middle" font-family="Meiryo, sans-serif" font-size="42" font-weight="700" fill="white">${label}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function registerServiceWorker() {
  if (OFFLINE_BUILD || !("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Offline cache is optional; the app still works while online.
    });
  });
}

function on(target, eventName, handler) {
  if (target) {
    target.addEventListener(eventName, handler);
  }
}

