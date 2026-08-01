// Initialize icons
lucide.createIcons();

// --- DOM Elements ---
const screens = {
  home: document.getElementById('screen-home'),
  capture: document.getElementById('screen-capture'),
  category: document.getElementById('screen-category'),
  loading: document.getElementById('screen-loading'),
  results: document.getElementById('screen-results'),
  error: document.getElementById('screen-error')
};

// State
let capturedImageData = null;
let selectedCategory = null;
let mediaStream = null;

// Navigation
let currentScreenStr = 'home';
const historyStack = [];
const btnBack = document.getElementById('btn-back');

function showScreen(screenName, isBackwards = false) {
  if (!isBackwards && currentScreenStr !== screenName) {
    historyStack.push(currentScreenStr);
  }
  
  if (screenName === 'home') {
    historyStack.length = 0; // Clear history
  }

  currentScreenStr = screenName;

  Object.values(screens).forEach(screen => screen.classList.remove('active'));
  screens[screenName].classList.add('active');
  
  btnBack.style.display = historyStack.length > 0 ? 'block' : 'none';

  // Re-init icons just in case
  lucide.createIcons();
}

btnBack.addEventListener('click', () => {
  if (historyStack.length > 0) {
    const prevScreen = historyStack.pop();
    showScreen(prevScreen, true);
  }
});

document.getElementById('logo-home').addEventListener('click', () => {
  showScreen('home');
});

// --- Home Screen ---
document.getElementById('btn-start').addEventListener('click', () => {
  showScreen('capture');
});

// --- Capture Screen ---
const videoFeed = document.getElementById('video-feed');
const imagePreview = document.getElementById('image-preview');
const btnCamera = document.getElementById('btn-camera');
const btnTakePhoto = document.getElementById('btn-take-photo');
const btnGallery = document.getElementById('btn-gallery');
const galleryInput = document.getElementById('gallery-input');
const btnSaveGallery = document.getElementById('btn-save-gallery');
const btnAnalyze = document.getElementById('btn-analyze');

async function startCamera() {
  const cameraPlaceholder = document.getElementById('camera-placeholder');
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: 'environment' } 
    });
    videoFeed.srcObject = mediaStream;
    if (cameraPlaceholder) cameraPlaceholder.style.display = 'none';
    imagePreview.style.display = 'none';
    videoFeed.style.display = 'block';
    btnCamera.style.display = 'none';
    btnTakePhoto.style.display = 'flex';
  } catch (err) {
    alert("Camera access denied or unavailable. Please use the gallery upload.");
  }
}

function stopCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
  }
}

btnCamera.addEventListener('click', startCamera);

btnTakePhoto.addEventListener('click', () => {
  const canvas = document.createElement('canvas');
  canvas.width = videoFeed.videoWidth || 640;
  canvas.height = videoFeed.videoHeight || 480;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoFeed, 0, 0, canvas.width, canvas.height);
  
  capturedImageData = canvas.toDataURL('image/png');
  showCapturedImage();
  stopCamera();
});

btnGallery.addEventListener('click', () => {
  galleryInput.click();
});

galleryInput.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      capturedImageData = event.target.result;
      showCapturedImage();
      stopCamera();
    };
    reader.onerror = (err) => {
      console.error("FileReader Error:", err);
      alert("Failed to read the selected file. Please select a valid image.");
    };
    reader.readAsDataURL(file);
  }
});

function showCapturedImage() {
  const cameraPlaceholder = document.getElementById('camera-placeholder');
  if (cameraPlaceholder) cameraPlaceholder.style.display = 'none';
  videoFeed.style.display = 'none';
  
  imagePreview.src = capturedImageData;
  imagePreview.style.display = 'block';
  
  btnTakePhoto.style.display = 'none';
  btnCamera.style.display = 'flex';
  btnCamera.innerHTML = '<i data-lucide="refresh-cw"></i> Retake';
  btnSaveGallery.style.display = 'flex';
  btnAnalyze.style.display = 'flex';
  lucide.createIcons();
}

btnSaveGallery.addEventListener('click', () => {
  if (!capturedImageData) return;
  const link = document.createElement('a');
  link.href = capturedImageData;
  link.download = `IngredientScan_${new Date().getTime()}.png`;
  link.click();
  alert("Image saved/downloaded!");
});

btnAnalyze.addEventListener('click', () => {
  showScreen('category');
});

// --- Category Screen ---
const categoryCards = document.querySelectorAll('.category-card');
const btnProcess = document.getElementById('btnProcess') || document.getElementById('btn-process');

categoryCards.forEach(card => {
  card.addEventListener('click', () => {
    categoryCards.forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedCategory = card.getAttribute('data-category');
    btnProcess.disabled = false;
  });
});

btnProcess.addEventListener('click', () => {
  showScreen('loading');
  analyzeImageWithGemini();
});

// --- Error Warning Handling ---
function showError(title, message) {
  document.getElementById('error-title').textContent = title;
  document.getElementById('error-message').textContent = message;
  showScreen('error');
}

document.getElementById('btn-retry-error').addEventListener('click', () => {
  showScreen('loading');
  analyzeImageWithGemini();
});

document.getElementById('btn-recapture-error').addEventListener('click', () => {
  showScreen('capture');
});

async function analyzeImageWithGemini() {
  const textElem = document.getElementById('loading-text');
  textElem.textContent = "Connecting to analysis server...";

  if (!capturedImageData) {
    showError("No Image Captured", "Please take a photo or select an image from your gallery before analyzing.");
    return;
  }

  try {
    textElem.textContent = "Uploading image & analyzing ingredients via secure proxy...";
    
    let response;
    try {
      response = await fetch('/.netlify/functions/analyze', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: capturedImageData,
          category: selectedCategory
        })
      });
    } catch (networkErr) {
      showError("Low Internet Connectivity", "Could not reach the analysis server. Please check your network connection.");
      return;
    }

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const errMsg = errBody.error?.message || `Server returned status ${response.status}`;
      showError("Analysis Server Error", errMsg);
      return;
    }

    const data = await response.json();
    textElem.textContent = "Compiling safety & health evaluations...";

    let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      showError("Image Unreadable", "The analysis engine could not extract clear ingredient text from this photo. Please try taking a sharper image in better lighting.");
      return;
    }
    
    rawText = rawText.replace(/```json/gi, '').replace(/```/gi, '').trim();
    const parsedResults = JSON.parse(rawText);

    const activeResults = {
      beneficial: parsedResults.beneficial || [],
      harmful: parsedResults.harmful || [],
      neutral: parsedResults.neutral || []
    };

    renderResults(activeResults);
    showScreen('results');

  } catch (err) {
    console.error("Analysis Error:", err);
    showError("Analysis Failed", "An error occurred while compiling the ingredient list. Please check your connection or retake a clearer photo.");
  }
}

// --- Results Data Mock ---
const mockResults = {
  beneficial: [
    {
      name: "Niacinamide",
      role: "Vitamin B3 derivative",
      description: "Human Health: Helps build keratin, reduces inflammation, and improves skin barrier resilience.",
      emphasis: "Extremely beneficial for human skin health and barrier repair.",
      banStatus: "Not globally banned",
      evaluations: "Generally Recognized as Safe (GRAS) by FDA"
    },
    {
      name: "Hyaluronic Acid",
      role: "Humectant",
      description: "Human Health: Draws moisture into the skin, preventing dryness and reducing fine lines.",
      emphasis: "A hydration powerhouse that significantly benefits human skin elasticity.",
      banStatus: "Not globally banned",
      evaluations: "FDA approved for cosmetic and medical use"
    }
  ],
  harmful: [
    {
      name: "Oxybenzone",
      role: "UV Filter",
      description: "Human Health: Rapidly absorbed into the bloodstream. Known human endocrine disruptor linked to hormone alteration.\nEnvironment: Heavily harmful to coral reefs and marine life.",
      emphasis: "Critically concerning for human hormone health, and environmentally destructive.",
      banStatus: "Banned in Hawaii, Key West, and US Virgin Islands.",
      evaluations: "Under review by the EU Scientific Committee on Consumer Safety for endocrine concerns."
    },
    {
      name: "Parabens",
      role: "Preservative",
      description: "Human Health: Linked to hormone disruption in humans; found structurally intact in breast tissue.\nEnvironment: Can accumulate in aquatic organisms.",
      emphasis: "Poses risks to the human endocrine system.",
      banStatus: "Certain parabens are banned in the EU.",
      evaluations: "FDA continues to evaluate human safety data."
    }
  ],
  neutral: [
    {
      name: "Aqua (Water)",
      role: "Solvent",
      description: "Human Health: Non-reactive base for formulas. Perfectly safe for human contact.\nEnvironment: Universally safe and naturally occurring.",
      emphasis: "Essential but neutral impact on health.",
      banStatus: "Not banned",
      evaluations: "None"
    },
    {
      name: "Glycerin",
      role: "Humectant",
      description: "Human Health: Safely hydrates human skin without irritation.\nEnvironment: Typically plant-derived and biodegradable.",
      emphasis: "Standard safe ingredient for moisture retention.",
      banStatus: "Not banned",
      evaluations: "Generally safe"
    }
  ]
};

// --- Render Results ---
function renderResults(resultsData = mockResults) {
  const container = document.getElementById('results-container');
  container.innerHTML = '';
  
  const beneficialList = resultsData.beneficial || [];
  const harmfulList = resultsData.harmful || [];
  const neutralList = resultsData.neutral || [];

  // Beneficial
  renderGroup(container, beneficialList, 'beneficial', 'check-circle-2', 'Beneficial Ingredients');
  // Harmful
  renderGroup(container, harmfulList, 'harmful', 'x-circle', 'Harmful Ingredients');
  // Neutral
  renderGroup(container, neutralList, 'neutral', 'minus-circle', 'Neutral Ingredients');
  
  lucide.createIcons();
  
  // Setup expand listeners
  document.querySelectorAll('.ingredient-header').forEach(header => {
    header.addEventListener('click', () => {
      const card = header.parentElement;
      card.classList.toggle('expanded');
    });
  });
}

function renderGroup(container, items, typeClass, iconName, titleText) {
  if (items.length === 0) return;
  
  const groupDiv = document.createElement('div');
  groupDiv.className = `ingredient-group ${typeClass}`;
  
  groupDiv.innerHTML = `
    <h3 class="ingredient-group-title">
      <i data-lucide="${iconName}"></i> ${titleText}
    </h3>
  `;
  
  items.forEach(item => {
    const card = document.createElement('div');
    card.className = `ingredient-card ${typeClass}`;
    card.innerHTML = `
      <div class="ingredient-header">
        <div class="ingredient-name">
          <i data-lucide="${iconName}"></i> ${item.name}
        </div>
        <i data-lucide="chevron-down" style="color: #999;"></i>
      </div>
      <div class="ingredient-details">
        <p><strong>Role:</strong> ${item.role}</p>
        <p style="margin-top: 0.5rem">${item.description.replace(/\n/g, '<br>')}</p>
        <p style="margin-top: 0.5rem; font-weight: 600;">${item.emphasis}</p>
        <div style="margin-top: 1rem;">
          <span class="badge badge-ban">Ban Info: ${item.banStatus}</span>
          <span class="badge badge-eval">Eval: ${item.evaluations}</span>
        </div>
      </div>
    `;
    groupDiv.appendChild(card);
  });
  
  container.appendChild(groupDiv);
}

// Restart flow
document.getElementById('btn-new-scan').addEventListener('click', () => {
  capturedImageData = null;
  selectedCategory = null;
  
  const cameraPlaceholder = document.getElementById('camera-placeholder');
  if (cameraPlaceholder) cameraPlaceholder.style.display = 'flex';
  
  imagePreview.src = '';
  imagePreview.style.display = 'none';
  videoFeed.style.display = 'none';
  btnTakePhoto.style.display = 'none';
  btnCamera.style.display = 'flex';
  btnCamera.innerHTML = '<i data-lucide="camera"></i> Open Camera';
  btnSaveGallery.style.display = 'none';
  btnAnalyze.style.display = 'none';
  galleryInput.value = '';
  
  categoryCards.forEach(c => c.classList.remove('selected'));
  if (btnProcess) btnProcess.disabled = true;
  
  showScreen('capture');
});

document.getElementById('btn-save-list').addEventListener('click', () => {
  alert("Analysis saved to local scope! You can access it later (mocked action).");
});
