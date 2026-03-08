import { NextResponse } from "next/server";

/**
 * Dummy AI model endpoint for local testing.
 * Returns a static, realistic‑looking response without calling any external API.
 * This can be used when the Gemini quota is exhausted or when you want a quick
 * placeholder for UI development.
 */
export async function POST(req: Request) {
    try {
        // Parse request body just to keep the same shape as the real endpoints.
        const { question, contextSummary, systemPrompt } = await req.json();
        // Generate a deterministic dummy response based on the input (optional).
        const dummyText = `Dummy response for question: "${question ?? "[none]"}". ` +
            `System prompt: "${systemPrompt ?? "[none]"}". ` +
            `Context summary: ${JSON.stringify(contextSummary ?? {}, null, 2)}.`;
        return NextResponse.json({ content: [{ type: "text", text: dummyText }] });
    } catch (error: any) {
        console.error("Dummy model error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
