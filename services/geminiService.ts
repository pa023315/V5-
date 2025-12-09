// 移除所有外部 SDK 依賴，改用原生 Fetch 以確保相容性

// 🔧 工具：將 Blob URL 強制轉為 Base64
const fetchBlobToBase64 = async (blobUrl: string): Promise<string> => {
  try {
    const response = await fetch(blobUrl);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        // 確保回傳乾淨的 Base64 (去掉 data:image/xxx;base64, 前綴)
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Blob 讀取失敗:", error);
    return "";
  }
};

// 🔧 核心壓縮與處理邏輯
const processImage = async (input: string): Promise<string> => {
  if (!input) return "";

  // 如果已經是乾淨的 Base64 (長度夠長且沒有 url 前綴)，直接回傳
  if (!input.startsWith("blob:") && !input.startsWith("http") && !input.startsWith("data:") && input.length > 200) {
    return input;
  }

  // 1. 處理 Blob URL
  if (input.startsWith("blob:")) {
    const base64 = await fetchBlobToBase64(input);
    if (!base64) return "";
    return base64; 
  } 
  
  // 2. 處理 Data URL (data:image/...)
  if (input.startsWith("data:")) {
    return input.split(',')[1];
  }

  return "";
};

// 🔧 呼叫 Google API 的核心函式 (原生 Fetch)
const callGoogleApi = async (modelName: string, apiKey: string, userImage: string, garmentImage: string): Promise<string> => {
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  
  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: `You are an AI stylist.
            INPUTS:
            - Image 1: User
            - Image 2: Garment
            
            TASK:
            Generate a photorealistic image of the User wearing the Garment.
            - Maintain the user's pose, body shape, and lighting.
            - Adapt the garment to fit naturally.
            
            Return ONLY the generated image.`
          },
          {
            inline_data: {
              mime_type: "image/jpeg",
              data: userImage
            }
          },
          {
            inline_data: {
              mime_type: "image/jpeg",
              data: garmentImage
            }
          }
        ]
      }
    ]
  };

  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody)
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMessage = data.error?.message || response.statusText;
    throw new Error(`[${response.status}] ${errorMessage}`);
  }

  // 解析回應
  if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
    return data.candidates[0].content.parts[0].text;
  }

  throw new Error("API 回傳了空的結果");
};

// === 主函式 ===
export const generateTryOnImage = async (
  apiKey: string,
  arg1: string,
  arg2: string,
  arg3: string,
  arg4: string
): Promise<string> => {
  
  if (!apiKey) throw new Error("API Key is missing");

  console.log("🚀 開始處理圖片 (Native Fetch + Auto Failover)...");

  // 1. 智慧參數池：抓出真正的圖片
  const allArgs = [arg1, arg2, arg3, arg4];
  const validImages = allArgs.filter(arg => 
    arg && (arg.startsWith("blob:") || arg.length > 200)
  );

  console.log(`偵測到 ${validImages.length} 張有效圖片`);

  if (validImages.length < 2) {
    throw new Error("圖片參數遺失：無法找到兩張圖片。");
  }

  // 2. 取得乾淨的 Base64
  const [base64User, base64Garment] = await Promise.all([
    processImage(validImages[0]),
    processImage(validImages[1])
  ]);

  if (!base64User || !base64Garment) {
    throw new Error("圖片轉換 Base64 失敗");
  }

  // 3. 自動故障轉移 (Failover) 機制
  // 依序嘗試以下模型，直到成功為止
  const MODELS = [
    "gemini-1.5-flash",       // 首選 (快速)
    "gemini-1.5-pro",         // 備選 (穩定)
    "gemini-1.5-flash-001",   // 指定版本
    "gemini-1.0-pro-vision"   // 舊版保底
  ];

  let lastError = null;

  for (const model of MODELS) {
    try {
      console.log(`正在嘗試模型: ${model}...`);
      const result = await callGoogleApi(model, apiKey, base64User, base64Garment);
      console.log(`✅ 模型 ${model} 呼叫成功！`);
      return result;
    } catch (error: any) {
      console.warn(`⚠️ 模型 ${model} 失敗: ${error.message}`);
      lastError = error;

      // 如果是 API Key 錯誤 (400/403)，就不需要試別的模型了，直接報錯
      if (error.message.includes("400") || error.message.includes("403") || error.message.includes("API key")) {
        throw new Error("API Key 無效或權限不足，請檢查您的 Key。");
      }
      // 如果是 404 (模型找不到) 或 503 (過載)，則繼續迴圈嘗試下一個
    }
  }

  // 4. 如果全部失敗
  console.error("❌ 所有模型嘗試皆失敗。");
  throw new Error(`生成失敗: ${lastError?.message || "無法連接到 Google API"}`);
};
