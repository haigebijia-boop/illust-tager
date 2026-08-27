// コンタクトシート（Web版 / GitHub Pages想定）
// サーバー(Python)は使わず、Firebase + Cloudinaryだけでデータの保存・認証・検索を行う。
//
// - 画像本体      → Cloudinary（unsigned upload preset経由でクライアントから直接アップロード）
// - タグ等のメタ情報 → Firebase Firestore（コレクション名: illustrations）
// - ログイン       → Firebase Authentication（メール/パスワード）
//   ※ 新規登録フォームは用意していない。オーナー自身をFirebaseコンソールの
//     「Authentication」タブから手動で1ユーザーとして追加しておく想定。
//
// 閲覧(読み取り)は誰でも可能、追加・編集・削除はログインしたユーザーのみ
// （Firestoreへのアクセス制御は firestore.rules 側で行っている。
//   このファイルでのログイン状態によるUI出し分けは、あくまで見た目の制御。
//   Cloudinaryへのアップロードはunsigned presetを使うため、Firebase Authの
//   ログイン状態はこのアプリのUI上でのみチェックしている点に注意）

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";
import { cloudinaryConfig } from "./cloudinary-config.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

const COLLECTION_NAME = "illustrations";

(() => {
  "use strict";

  // ---------------- 要素参照 ----------------

  const galleryEl = document.getElementById("gallery");
  const emptyStateEl = document.getElementById("emptyState");
  const loadingStateEl = document.getElementById("loadingState");
  const resultCountEl = document.getElementById("resultCount");

  const filterYear = document.getElementById("filterYear");
  const filterMonth = document.getElementById("filterMonth");
  const filterCharacter = document.getElementById("filterCharacter");
  const filterColor = document.getElementById("filterColor");
  const filterKeyword = document.getElementById("filterKeyword");
  const resetFiltersBtn = document.getElementById("resetFilters");

  const uploadPanel = document.getElementById("uploadPanel");
  const toggleUploadBtn = document.getElementById("toggleUpload");
  const uploadForm = document.getElementById("uploadForm");
  const fileInput = document.getElementById("fileInput");
  const previewWrap = document.getElementById("previewWrap");
  const previewImg = document.getElementById("previewImg");
  const uploadStatus = document.getElementById("uploadStatus");
  const dateInput = document.getElementById("dateInput");
  const colorInput = document.getElementById("colorInput");
  const colorSuggestions = document.getElementById("colorSuggestions");
  const colorChips = document.getElementById("colorChips");
  const addAllColorsBtn = document.getElementById("addAllColorsBtn");

  const authStatusEl = document.getElementById("authStatus");
  const loginToggleBtn = document.getElementById("loginToggleBtn");
  const loginPanel = document.getElementById("loginPanel");
  const loginForm = document.getElementById("loginForm");
  const loginEmail = document.getElementById("loginEmail");
  const loginPassword = document.getElementById("loginPassword");
  const loginStatus = document.getElementById("loginStatus");

  const modal = document.getElementById("detailModal");
  const modalBackdrop = document.getElementById("modalBackdrop");
  const modalClose = document.getElementById("modalClose");
  const modalImage = document.getElementById("modalImage");
  const modalMeta = document.getElementById("modalMeta");
  const editTitle = document.getElementById("editTitle");
  const editDate = document.getElementById("editDate");
  const editCharacters = document.getElementById("editCharacters");
  const editColors = document.getElementById("editColors");
  const editMemo = document.getElementById("editMemo");
  const saveBtn = document.getElementById("saveBtn");
  const deleteBtn = document.getElementById("deleteBtn");

  let allItems = [];      // Firestoreから取得した全件（クライアント側で検索フィルタする）
  let currentUser = null;
  let currentItemId = null;

  // ---------------- タグ分割の共通ヘルパー ----------------

  function splitTags(raw) {
    if (!raw) return [];
    return raw
      .split(/[,、,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  // ---------------- ログイン状態によるUI出し分け ----------------

  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (user) {
      authStatusEl.textContent = user.email;
      authStatusEl.classList.remove("hidden");
      loginToggleBtn.textContent = "ログアウト";
      uploadPanel.classList.remove("hidden");
      loginPanel.classList.add("hidden");
    } else {
      authStatusEl.classList.add("hidden");
      loginToggleBtn.textContent = "ログイン";
      uploadPanel.classList.add("hidden");
    }
    updateModalEditability();
    renderGallery(applyFilters(allItems));
  });

  loginToggleBtn.addEventListener("click", () => {
    if (currentUser) {
      signOut(auth);
    } else {
      loginPanel.classList.toggle("hidden");
    }
  });

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginStatus.textContent = "ログイン中...";
    try {
      await signInWithEmailAndPassword(auth, loginEmail.value, loginPassword.value);
      loginStatus.textContent = "";
      loginForm.reset();
    } catch (err) {
      console.error(err);
      loginStatus.textContent = "ログインに失敗しました";
    }
  });

  // ---------------- 追加日の自動入力 ----------------

  function fillTodayAsDrawnDate() {
    if (dateInput.value) return;
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    dateInput.value = `${yyyy}-${mm}`;
  }

  // ---------------- アップロードパネルの開閉 ----------------

  toggleUploadBtn.addEventListener("click", () => {
    uploadForm.classList.toggle("hidden");
    if (!uploadForm.classList.contains("hidden")) {
      fillTodayAsDrawnDate();
    }
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) {
      previewWrap.classList.add("hidden");
      colorSuggestions.classList.add("hidden");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target.result;
      previewWrap.classList.remove("hidden");
    };
    reader.readAsDataURL(file);
  });

  // ---------------- 色味タグ：ブラウザ側での自動検出＋候補チップ ----------------

  function splitColorTags(raw) {
    return splitTags(raw);
  }

  function isColorTagSelected(name) {
    return splitColorTags(colorInput.value).includes(name);
  }

  function addColorTag(name) {
    const tags = splitColorTags(colorInput.value);
    if (!tags.includes(name)) tags.push(name);
    colorInput.value = tags.join(", ");
  }

  function removeColorTag(name) {
    const tags = splitColorTags(colorInput.value).filter((t) => t !== name);
    colorInput.value = tags.join(", ");
  }

  previewImg.addEventListener("load", () => {
    let detected = [];
    try {
      detected = detectDominantColorNames(previewImg, 5);
    } catch (err) {
      detected = [];
    }
    renderColorChips(detected);
  });

  function renderColorChips(detectedColors) {
    colorChips.innerHTML = "";
    if (!detectedColors.length) {
      colorSuggestions.classList.add("hidden");
      return;
    }
    detectedColors.forEach((name) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "color-chip-btn";
      btn.textContent = name;
      if (isColorTagSelected(name)) btn.classList.add("active");

      btn.addEventListener("click", () => {
        if (btn.classList.contains("active")) {
          removeColorTag(name);
          btn.classList.remove("active");
        } else {
          addColorTag(name);
          btn.classList.add("active");
        }
      });
      colorChips.appendChild(btn);
    });

    addAllColorsBtn.onclick = () => {
      detectedColors.forEach(addColorTag);
      colorChips.querySelectorAll(".color-chip-btn").forEach((btn) => btn.classList.add("active"));
    };

    colorSuggestions.classList.remove("hidden");
  }

  function rgbToColorNameJa(r, g, b) {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
    const v = max;
    const s = max === 0 ? 0 : (max - min) / max;
    let h = 0;
    if (max !== min) {
      if (max === rn) h = 60 * (((gn - bn) / (max - min)) % 6);
      else if (max === gn) h = 60 * ((bn - rn) / (max - min) + 2);
      else h = 60 * ((rn - gn) / (max - min) + 4);
    }
    if (h < 0) h += 360;

    if (v < 0.18) return "黒";
    if (s < 0.12) return v > 0.85 ? "白" : "グレー";
    if (h < 15 || h >= 345) return "赤";
    if (h < 45) return "オレンジ";
    if (h < 65) return "黄";
    if (h < 170) return "緑";
    if (h < 200) return "水色";
    if (h < 250) return "青";
    if (h < 290) return "紫";
    if (h < 345) return "ピンク";
    return "その他";
  }

  function detectDominantColorNames(imgEl, numColors) {
    const canvas = document.createElement("canvas");
    const size = 80;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(imgEl, 0, 0, size, size);

    let data;
    try {
      data = ctx.getImageData(0, 0, size, size).data;
    } catch (err) {
      return [];
    }

    const counts = new Map();
    for (let i = 0; i < data.length; i += 4) {
      const r = Math.floor(data[i] / 32) * 32;
      const g = Math.floor(data[i + 1] / 32) * 32;
      const b = Math.floor(data[i + 2] / 32) * 32;
      const key = `${r},${g},${b}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const names = [];
    for (const [key] of sorted) {
      const [r, g, b] = key.split(",").map(Number);
      const name = rgbToColorNameJa(r, g, b);
      if (!names.includes(name)) names.push(name);
      if (names.length >= numColors) break;
    }
    return names;
  }

  // ---------------- アップロード送信 ----------------

  // Cloudinaryのunsigned upload presetを使ってクライアントから直接アップロードする。
  // 署名（signature）が不要な代わりに、preset名を知っていれば誰でもアップロードできる
  // 仕組みなので、preset名の取り扱いは README.md の注意事項を参照。
  async function uploadToCloudinary(file) {
    const url = `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", cloudinaryConfig.uploadPreset);

    const res = await fetch(url, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      throw new Error(`Cloudinaryへのアップロードに失敗しました (status: ${res.status})`);
    }
    return res.json(); // { secure_url, public_id, ... }
  }

  uploadForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser) {
      uploadStatus.textContent = "ログインしてください";
      return;
    }
    const file = fileInput.files[0];
    if (!file) return;

    uploadStatus.textContent = "アップロード中...";
    try {
      const cloudinaryResult = await uploadToCloudinary(file);
      const imageURL = cloudinaryResult.secure_url;

      const drawnDateValue = dateInput.value; // "YYYY-MM"
      let drawnYear = null, drawnMonth = null;
      if (drawnDateValue) {
        const [y, m] = drawnDateValue.split("-").map(Number);
        drawnYear = y;
        drawnMonth = m;
      }

      await addDoc(collection(db, COLLECTION_NAME), {
        title: document.getElementById("titleInput").value.trim(),
        drawnYear,
        drawnMonth,
        characters: splitTags(document.getElementById("charInput").value),
        colors: splitTags(colorInput.value),
        memo: document.getElementById("memoInput").value.trim(),
        imageURL,
        imagePublicId: cloudinaryResult.public_id,
        createdAt: serverTimestamp(),
        createdBy: currentUser.email,
      });

      uploadStatus.textContent = "登録しました";
      uploadForm.reset();
      previewWrap.classList.add("hidden");
      colorSuggestions.classList.add("hidden");
      uploadForm.classList.add("hidden");
      await loadGallery();
      setTimeout(() => (uploadStatus.textContent = ""), 2500);
    } catch (err) {
      console.error(err);
      uploadStatus.textContent = "登録に失敗しました";
    }
  });

  // ---------------- 検索・フィルタ ----------------

  function buildFilterOptions(items) {
    const years = new Set();
    const characters = new Set();
    const colors = new Set();
    items.forEach((item) => {
      if (item.drawnYear) years.add(item.drawnYear);
      (item.characters || []).forEach((c) => characters.add(c));
      (item.colors || []).forEach((c) => colors.add(c));
    });
    fillSelect(filterYear, [...years].sort((a, b) => b - a), (y) => `${y}年`);
    fillSelect(filterCharacter, [...characters].sort(), (c) => c);
    fillSelect(filterColor, [...colors].sort(), (c) => c);
  }

  function fillSelect(selectEl, values, labelFn) {
    const current = selectEl.value;
    selectEl.innerHTML = '<option value="">すべて</option>';
    values.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = String(v);
      opt.textContent = labelFn(v);
      selectEl.appendChild(opt);
    });
    if (values.map(String).includes(current) || current === "") {
      selectEl.value = current;
    }
  }

  // 月のプルダウンは固定で1〜12
  for (let m = 1; m <= 12; m++) {
    const opt = document.createElement("option");
    opt.value = String(m);
    opt.textContent = `${m}月`;
    filterMonth.appendChild(opt);
  }

  function applyFilters(items) {
    const year = filterYear.value;
    const month = filterMonth.value;
    const character = filterCharacter.value;
    const color = filterColor.value;
    const keyword = filterKeyword.value.trim().toLowerCase();

    return items.filter((item) => {
      if (year && String(item.drawnYear) !== year) return false;
      if (month && String(item.drawnMonth) !== month) return false;
      if (character && !(item.characters || []).includes(character)) return false;
      if (color && !(item.colors || []).includes(color)) return false;
      if (keyword) {
        const haystack = [
          item.title || "",
          item.memo || "",
          ...(item.characters || []),
        ].join(" ").toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }
      return true;
    });
  }

  [filterYear, filterMonth, filterCharacter, filterColor].forEach((el) =>
    el.addEventListener("change", () => renderGallery(applyFilters(allItems)))
  );

  let keywordTimer = null;
  filterKeyword.addEventListener("input", () => {
    clearTimeout(keywordTimer);
    keywordTimer = setTimeout(() => renderGallery(applyFilters(allItems)), 250);
  });

  resetFiltersBtn.addEventListener("click", () => {
    filterYear.value = "";
    filterMonth.value = "";
    filterCharacter.value = "";
    filterColor.value = "";
    filterKeyword.value = "";
    renderGallery(applyFilters(allItems));
  });

  // ---------------- データ読み込み・ギャラリー描画 ----------------

  async function loadGallery() {
    loadingStateEl.classList.remove("hidden");
    emptyStateEl.classList.add("hidden");
    try {
      const q = query(collection(db, COLLECTION_NAME), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      allItems = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.error(err);
      allItems = [];
    }
    loadingStateEl.classList.add("hidden");
    buildFilterOptions(allItems);
    renderGallery(applyFilters(allItems));
  }

  function renderGallery(items) {
    galleryEl.innerHTML = "";
    resultCountEl.textContent = `${items.length}件`;

    if (items.length === 0) {
      emptyStateEl.classList.remove("hidden");
      return;
    }
    emptyStateEl.classList.add("hidden");

    items.forEach((item) => {
      const card = document.createElement("div");
      card.className = "card";
      card.addEventListener("click", () => openModal(item));

      const dateLabel =
        item.drawnYear && item.drawnMonth
          ? `${item.drawnYear}.${String(item.drawnMonth).padStart(2, "0")}`
          : "日付未設定";

      const tagsHtml = [
        ...(item.characters || []).map((c) => `<span class="tag-chip">${escapeHtml(c)}</span>`),
        ...(item.colors || []).map((c) => `<span class="tag-chip color-chip">${escapeHtml(c)}</span>`),
      ].join("");

      card.innerHTML = `
        <img class="card-thumb" src="${item.imageURL}" alt="${escapeHtml(item.title || "無題")}" loading="lazy">
        <div class="card-meta">
          <p class="card-title">${escapeHtml(item.title || "無題")}</p>
          <p class="card-date">${dateLabel}</p>
          <div class="tag-row">${tagsHtml}</div>
        </div>
      `;
      galleryEl.appendChild(card);
    });
  }

  // ---------------- 詳細モーダル ----------------

  function updateModalEditability() {
    const editable = !!currentUser;
    [editTitle, editDate, editCharacters, editColors, editMemo].forEach((el) => {
      el.disabled = !editable;
    });
    saveBtn.classList.toggle("hidden", !editable);
    deleteBtn.classList.toggle("hidden", !editable);
  }

  function openModal(item) {
    currentItemId = item.id;
    modalImage.src = item.imageURL;
    editTitle.value = item.title || "";
    editDate.value =
      item.drawnYear && item.drawnMonth
        ? `${item.drawnYear}-${String(item.drawnMonth).padStart(2, "0")}`
        : "";
    editCharacters.value = (item.characters || []).join(", ");
    editColors.value = (item.colors || []).join(", ");
    editMemo.value = item.memo || "";

    const createdLabel = item.createdAt && item.createdAt.toDate
      ? item.createdAt.toDate().toLocaleString("ja-JP")
      : "";
    modalMeta.textContent = `登録日時: ${createdLabel}`;

    updateModalEditability();
    modal.classList.remove("hidden");
  }

  function closeModal() {
    modal.classList.add("hidden");
    currentItemId = null;
  }

  modalBackdrop.addEventListener("click", closeModal);
  modalClose.addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
  });

  saveBtn.addEventListener("click", async () => {
    if (!currentUser || currentItemId == null) return;

    const drawnDateValue = editDate.value;
    let drawnYear = null, drawnMonth = null;
    if (drawnDateValue) {
      const [y, m] = drawnDateValue.split("-").map(Number);
      drawnYear = y;
      drawnMonth = m;
    }

    try {
      await updateDoc(doc(db, COLLECTION_NAME, currentItemId), {
        title: editTitle.value.trim(),
        drawnYear,
        drawnMonth,
        characters: splitTags(editCharacters.value),
        colors: splitTags(editColors.value),
        memo: editMemo.value.trim(),
      });
      closeModal();
      await loadGallery();
    } catch (err) {
      console.error(err);
      alert("保存に失敗しました。ログイン状態を確認してください。");
    }
  });

  deleteBtn.addEventListener("click", async () => {
    if (!currentUser || currentItemId == null) return;
    if (!confirm("このイラストを削除しますか？元に戻せません。\n（Cloudinary上の画像ファイル自体は削除されず残ります）")) return;

    try {
      // Firestoreのレコードのみ削除する。Cloudinary側の画像削除にはAPIの署名が必要で、
      // unsigned upload presetだけでは実行できないため、画像ファイル自体は残る仕様にしている。
      await deleteDoc(doc(db, COLLECTION_NAME, currentItemId));
      closeModal();
      await loadGallery();
    } catch (err) {
      console.error(err);
      alert("削除に失敗しました。ログイン状態を確認してください。");
    }
  });

  // ---------------- 初期化 ----------------

  fillTodayAsDrawnDate();
  loadGallery();
})();
