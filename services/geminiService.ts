import { GoogleGenerativeAI } from "@google/generative-ai";

export const generateTryOnImage = async (
  apiKey: string,
  userImageBase64: string,
  userImageMimeType: string,
  garmentImageBase64: string,
  garmentImageMimeType: string
): Promise<string> => {
  
  const genAI = new GoogleGenerativeAI(apiKey);

  try {
    // 1. 照您的要求，保留 gemini-2.5-flash-image
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // 2. 修正：將您原本掉在外面的 Prompt 文字，全部包進這裡
    const prompt = `You are an advanced AI Art Director capable of handling both Photorealism and Anime/2D Art styles.
    
    ### INPUTS
    Image 1: The USER (Target Model).
    Image 2: The GARMENT (Reference Clothing).

    ### STEP 1: STYLE ANALYSIS (Crucial)
    Analyze Image 1 (The User). Is this person:
    A. **Real Human** (Photograph, realistic skin texture, natural lighting)?
    B. **Anime/2D Character** (Illustration, cel-shading, outlines, stylized proportions)?

    ### STEP 2: RENDERING LOGIC
    Based on Step 1, execute the following strict logic:

    **CASE A: If User is REAL HUMAN:**
    - **Goal**: Photorealism.
    - **Action**: Put the garment on the user.
    - **Texture Handling**: 
      - If the Garment image is also real: Keep the realistic textures.
      - If the Garment image is Anime/2D: You MUST "Realize" it. Add realistic fabric textures (cotton, silk, denim), realistic folds, and natural lighting to make it look like a real physical object.
    - **Output Style**: High-quality Photograph.

    **CASE B: If User is ANIME/2D CHARACTER:**
    - **Goal**: 2D Illustration / Anime Style.
    - **Action**: Redraw the garment onto the character.
    - **Texture Handling**: 
      - If the Garment image is Real: You MUST "Flatten" it. Remove realistic noise and complex textures. Convert it to **Cel-Shading** or **Soft-Shading** to match the exact drawing style of the character.
      - **Identity Rule**: Do NOT change the character's face or body into a real person. Keep the 2D aesthetic 100%.
    - **Output Style**: Anime Illustration (matching Image 1's artist style).

    ### STEP 3: EXECUTION
    Return ONLY the generated image.`;

    // 3. 發送請求：包含 Prompt + 使用者照片 + 衣服照片
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: userImageBase64,
          mimeType: userImageMimeType,
        },
      },
      {
        inlineData: {
          data: garmentImageBase64,
          mimeType: garmentImageMimeType,
        },
      }
    ]);

    const response = await result.response;

    // 4. 解析圖片回傳 (這是您原本寫在後面但跑不到的邏輯，現在移上來了)
    if (response.candidates && response.candidates.length > 0) {
      const parts = response.candidates[0].content?.parts;
      if (parts) {
        for (const part of parts) {
          if (part.inlineData && part.inlineData.data) {
            return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
          }
        }
      }
    }

    // 如果沒有圖片，嘗試回傳文字，或拋出錯誤
    if (response.text()) {
        return response.text(); 
    }
    
    throw new Error("未生成影像。模型可能僅返回了文字，請重試。");

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};
