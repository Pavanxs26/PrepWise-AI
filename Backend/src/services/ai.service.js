const { GoogleGenAI } = require("@google/genai");
const { z } = require("zod");
const { zodToJsonSchema } = require("zod-to-json-schema");
const puppeteer = require("puppeteer");

const ai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENAI_API_KEY
});

// ✅ Schema
const interviewReportSchema = z.object({
    matchScore: z.number(),
    technicalQuestions: z.array(z.object({
        question: z.string(),
        intention: z.string(),
        answer: z.string()
    })),
    behavioralQuestions: z.array(z.object({
        question: z.string(),
        intention: z.string(),
        answer: z.string()
    })),
    skillGaps: z.array(z.object({
        skill: z.string(),
        severity: z.enum(["low", "medium", "high"])
    })),
    preparationPlan: z.array(z.object({
        day: z.number(),
        focus: z.string(),
        tasks: z.array(z.string())
    })),
    title: z.string()
});


// ✅ SAFE PARSER
function safeParseJSON(text) {
    try {
        return JSON.parse(text);
    } catch (err) {
        console.error("❌ Invalid JSON from AI:", text);
        return {};
    }
}


// ✅ CLEAN ARRAY FIXER (handles broken Gemini output)
function normalizeArray(data, keys) {
    if (!Array.isArray(data)) return [];

    // Already correct
    if (typeof data[0] === "object") return data;

    const result = [];

    for (let i = 0; i < data.length; i += keys.length * 2) {
        const obj = {};

        for (let j = 0; j < keys.length; j++) {
            const keyIndex = i + j * 2;
            const valueIndex = keyIndex + 1;

            if (data[keyIndex] === keys[j]) {
                let value = data[valueIndex];

                // Fix tasks → always array
                if (keys[j] === "tasks") {
                    value = Array.isArray(value) ? value : [value || "Task"];
                }

                obj[keys[j]] = value || "";
            }
        }

        if (Object.keys(obj).length === keys.length) {
            result.push(obj);
        }
    }

    return result;
}


// ✅ REMOVE DUPLICATES
function uniqueByQuestion(arr) {
    const seen = new Set();
    return arr.filter(item => {
        if (!item.question) return false;
        if (seen.has(item.question)) return false;
        seen.add(item.question);
        return true;
    });
}


// ✅ MAIN FUNCTION
async function generateInterviewReport({ resume, selfDescription, jobDescription }) {

    const prompt = `
Return ONLY valid JSON.

STRICT FORMAT:
{
  "matchScore": number,
  "technicalQuestions": [
    { "question": "", "intention": "", "answer": "" }
  ],
  "behavioralQuestions": [
    { "question": "", "intention": "", "answer": "" }
  ],
  "skillGaps": [
    { "skill": "", "severity": "low|medium|high" }
  ],
  "preparationPlan": [
    { "day": number, "focus": "", "tasks": ["", "", ""] }
  ],
  "title": ""
}

RULES:
- NO extra text
- NO repeated keys
- NO flat arrays like ["question","answer"]
- Arrays MUST contain objects
- Minimum:
  - Generate 8–12 technical questions
- Generate 6–8 behavioral questions
  - 4-7 skillGaps
  - 5-9 preparationPlan days

DATA:
Resume: ${resume}
Self: ${selfDescription}
Job: ${jobDescription}
`;

    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: zodToJsonSchema(interviewReportSchema)
        }
    });

    console.log("AI RAW RESPONSE:", response.text);

    const raw = safeParseJSON(response.text);

    // ✅ NORMALIZE EVERYTHING
    let technicalQuestions = normalizeArray(raw.technicalQuestions, ["question", "intention", "answer"]);
    let behavioralQuestions = normalizeArray(raw.behavioralQuestions, ["question", "intention", "answer"]);
    let skillGaps = normalizeArray(raw.skillGaps, ["skill", "severity"]);
    let preparationPlan = normalizeArray(raw.preparationPlan, ["day", "focus", "tasks"]);

    // ✅ REMOVE DUPLICATES
    technicalQuestions = uniqueByQuestion(technicalQuestions);
    behavioralQuestions = uniqueByQuestion(behavioralQuestions);

    // Only limit upper bound (optional, to avoid overload)
    if (technicalQuestions.length > 15) {
        technicalQuestions = technicalQuestions.slice(0, 15);
    }

    if (behavioralQuestions.length > 10) {
        behavioralQuestions = behavioralQuestions.slice(0, 10);
    }

    // Keep minimums (fallback only if too low)
    if (technicalQuestions.length < 7) {
        technicalQuestions.push({
            question: "Explain REST API design",
            intention: "Check backend fundamentals",
            answer: "Explain endpoints, HTTP methods, statelessness, and best practices"
        });
    }

    if (behavioralQuestions.length < 5) {
        behavioralQuestions.push({
            question: "Tell me about a challenge you faced",
            intention: "Assess problem-solving",
            answer: "Use STAR method and explain impact"
        });
    }

    // Skill gaps (optional cap)
    if (skillGaps.length > 6) {
        skillGaps = skillGaps.slice(0, 6);
    }

    // Preparation plan (keep exactly 5 days)
    preparationPlan = preparationPlan.slice(0, 5);

    // ✅ FINAL SAFETY FALLBACKS
    if (technicalQuestions.length === 0) {
        technicalQuestions = [{
            question: "Explain REST API design",
            intention: "Check backend fundamentals",
            answer: "Explain endpoints, HTTP methods, statelessness, and best practices"
        }];
    }

    if (behavioralQuestions.length === 0) {
        behavioralQuestions = [{
            question: "Tell me about a challenge you faced",
            intention: "Assess problem-solving",
            answer: "Use STAR method and explain impact"
        }];
    }

    if (skillGaps.length === 0) {
        skillGaps = [{
            skill: "Data Structures",
            severity: "medium"
        }];
    }

    if (preparationPlan.length === 0) {
        preparationPlan = [{
            day: 1,
            focus: "Basics",
            tasks: ["Revise fundamentals", "Practice problems", "Review concepts"]
        }];
    }

    // ✅ FIX DAYS + TASKS
    preparationPlan = preparationPlan.map((item, index) => ({
        day: index + 1,
        focus: item.focus || "General",
        tasks: Array.isArray(item.tasks) ? item.tasks : ["Practice"]
    }));

    const report = {
        matchScore: Number(raw.matchScore) || 70,
        technicalQuestions,
        behavioralQuestions,
        skillGaps,
        preparationPlan,
        title: raw.title || jobDescription?.split("\n")[0] || "Software Developer"
    };

    return report;
}


// ✅ PDF FUNCTION (unchanged, but safer launch)
async function generatePdfFromHtml(htmlContent) {
    const browser = await puppeteer.launch({
        headless: "new"
    });

    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
        format: "A4",
        margin: {
            top: "20mm",
            bottom: "20mm",
            left: "15mm",
            right: "15mm"
        }
    });

    await browser.close();
    return pdfBuffer;
}


async function generateResumePdf({ resume, selfDescription, jobDescription }) {

    const resumePdfSchema = z.object({
        html: z.string()
    });

    const prompt = `Generate a professional ATS-friendly resume in HTML format. Return JSON with "html" field only.`;

    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: zodToJsonSchema(resumePdfSchema)
        }
    });

    const json = safeParseJSON(response.text);

    return await generatePdfFromHtml(json.html || "<h1>Resume</h1>");
}


module.exports = { generateInterviewReport, generateResumePdf };