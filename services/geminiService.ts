// 移除所有外部 SDK 依賴，改用原生 Fetch + 自動偵測模型列表

// 🔧 工具：將 Blob URL 強制轉為 Base64
const fetchBlobToBase64 = async (blobUrl: string): Promise<string> => {
  try {
    const response = await fetch(blobUrl);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
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

  if (!input.startsWith("blob:") && !input.startsWith("http") && !input.startsWith("data:") && input.length > 200) {
    return input;
  }

  if (input.startsWith("blob:")) {
    const base64 = await fetchBlobToBase64(input);
    if (!base64) return "";
    return base64; 
  } 
  
  if (input.startsWith("data:")) {
    return input.split(',')[1];
  }

  return "";
};

// 🕵️‍♀️ 核心診斷：詢問 Google 目前 Key 真正能用的模型有哪些
// 這步能徹底解決 404 問題，因為我們只呼叫存在的模型
const discoverAvailableModel = async (apiKey: string): Promise<string> => {
  try {
    console.log("🔍 正在查詢可用模型列表...");
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    
    if (!response.ok) {
      console.warn("無法取得模型列表，將使用預設模型。狀態碼:", response.status);
      return "gemini-1.5-flash"; // 預設值
    }

    const data = await response.json();
    if (!data.models) return "gemini-1.5-flash";

    // 篩選出支援 generateContent (生成內容) 的模型
    const models = data.models
      .filter((m: any) => m.supportedGenerationMethods.includes("generateContent"))
      .map((m: any) => m.name.replace("models/", ""));

    console.log("✅ Google 回傳可用模型:", models);

    // 優先順序策略：Flash > Pro > Vision
    // 我們從清單中挑選一個最佳的
    const preferredOrder = [
      "gemini-1.5-flash",
      "gemini-1.5-flash-001",
      "gemini-1.5-pro",
      "gemini-1.5-pro-001",
      "gemini-pro-vision" // 舊版保底
    ];

    for (const pref of preferredOrder) {
      if (models.includes(pref)) {
        console.log(`🎯 選定模型: ${pref}`);
        return pref;
      }
    }

    // 如果都沒有，就拿清單裡隨便一個有 'gemini' 字眼的
    const fallback = models.find((m: string) => m.includes("gemini"));
    return fallback || "gemini-1.5-flash";

  } catch (e) {
    console.error("模型偵測失敗:", e);
    return "gemini-1.5-flash";
  }
};

// 🔧 呼叫 API
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
          { inline_data: { mime_type: "image/jpeg", data: userImage } },
          { inline_data: { mime_type: "image/jpeg", data: garmentImage } }
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
    
    // 如果這時候還 404，那真的就是帳號問題了
    if (response.status === 404) {
        throw new Error(`模型 ${modelName} 無法存取 (404)。請確認您的 API Key 專案已啟用 Generative Language API。`);
    }
    // API Key 額度問題
    if (JSON.stringify(data).includes("limit: 0")) {
        throw new Error(`[CRITICAL] API Key 額度歸零或已失效。請更換 API Key。`);
    }

    throw new Error(`[${response.status}] ${errorMessage}`);
  }

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

  console.log("🚀 開始處理圖片 (Auto-Discovery Mode)...");

  // 1. 智慧參數池
  const allArgs = [arg1, arg2, arg3, arg4];
  const validImages = allArgs.filter(arg => 
    arg && (arg.startsWith("blob:") || arg.length > 200)
  );

  console.log(`偵測到 ${validImages.length} 張有效圖片`);

  if (validImages.length < 2) {
    throw new Error("圖片參數遺失：無法找到兩張圖片。");
  }

  // 2. 轉換圖片
  const [base64User, base64Garment] = await Promise.all([
    processImage(validImages[0]),
    processImage(validImages[1])
  ]);

  if (!base64User || !base64Garment) {
    throw new Error("圖片轉換 Base64 失敗");
  }

  // 3. 自動偵測最佳模型
  // 先去問 Google 到底有哪些模型可以用，避免盲猜導致 404
  const targetModel = await discoverAvailableModel(apiKey);

  // 4. 執行呼叫
  try {
    console.log(`🚀 最終決定使用模型: ${targetModel}`);
    return await callGoogleApi(targetModel, apiKey, base64User, base64Garment);
  } catch (error: any) {
    // 如果自動偵測的模型還是失敗，最後嘗試一次舊版保底
    if (error.message.includes("404") && targetModel !== "gemini-pro-vision") {
        console.warn("自動選擇的模型失敗，嘗試使用舊版 Vision 模型保底...");
        return await callGoogleApi("gemini-pro-vision", apiKey, base64User, base64Garment);
    }
    throw error;
  }
};
