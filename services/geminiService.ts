import { GoogleGenAI } from "@google/genai";

// We remove the global initialization to support dynamic API keys passed from the UI.

export const generateTryOnImage = async (
  userImageBase64: string,
  userImageMimeType: string,
  garmentImageBase64: string,
  garmentImageMimeType: string
): Promise<string> => {
  // Use process.env.API_KEY exclusively as per guidelines
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            text: `You are an advanced AI Art Director capable of handling both Photorealism and Anime/2D Art styles.
            
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
            Return ONLY the generated image.`
          },
          {
            inlineData: {
              data: userImageBase64,
              mimeType: userImageMimeType
            }
          },
          {
            inlineData: {
              data: garmentImageBase64,
              mimeType: garmentImageMimeType
            }
          }
        ]
      }
    });

    // Iterate through parts to find the image part
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

    throw new Error("未生成影像。模型可能僅返回了文字，請重試。");

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};
