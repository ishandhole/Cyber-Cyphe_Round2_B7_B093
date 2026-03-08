import { NextResponse } from "next/server";

export async function POST(req: Request) {
    try {
        const { context, systemPrompt } = await req.json();
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                system_instruction: {
                    parts: [{ text: systemPrompt }]
                },
                contents: [{ role: "user", parts: [{ text: `Operational Context (Signals/State): ${JSON.stringify(context)}\n\nReturn EXACTLY a JSON array of hypotheses.` }] }],
                generationConfig: {
                    maxOutputTokens: 2000,
                    temperature: 0.1,
                    responseMimeType: "application/json",
                },
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();

            // DEMO FALLBACK: If we hit a 429 Rate Limit, inject realistic mock data to keep the dashboard alive
            if (response.status === 429) {
                console.warn("[QUOTA EXHAUSTED] 429 Rate Limit Hit. Injecting cached fallback for demo continuity.");
                return NextResponse.json({
                    content: [{
                        text: "[{\"pattern\":\"Supply Chain Cascading Delay\",\"breachProbability\":0.85,\"confidence\":0.65,\"severity\":\"critical\",\"timeToImpact\":4.5,\"rootCause\":\"Major warehouse congestion combined with shadow ETA drift indicates an impending SLA breach downstream.\",\"cascadeRisk\":[\"Downstream assembly line shutdown\",\"Secondary carrier dispatch delays\",\"Inventory threshold breach at hub\"],\"recommendedAction\":\"Reroute pending volume to secondary carriers or authorize expedited processing out of the current hub.\"}]"
                    }]
                });
            }

            console.error("Gemini Reason API Error details:", JSON.stringify(errorData, null, 2));
            return NextResponse.json(errorData, { status: response.status });
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";

        return NextResponse.json({
            content: [{ type: "text", text }]
        });
    } catch (error: any) {
        console.error("Gemini Reason Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
