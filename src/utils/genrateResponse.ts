import OpenAI from "openai";

/*
Groq retires model ids without much notice — llama-3.3-70b-versatile was
decommissioned and started answering 404 "model_not_found". Keep the id in
one place, and let .env override it so the next retirement is a config
change rather than a code change.

Check what your key can reach with:
  curl -H "Authorization: Bearer $GROQ_API_KEY" \
       https://api.groq.com/openai/v1/models
*/
const REVIEW_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

const grok = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,

  // Grok OpenAI-compatible endpoint
  baseURL: "https://api.groq.com/openai/v1",
});

export async function generatePRReview(
  prData: {
    title: string;
    description?: string | null;
    files: {
      filename: string;
      status: string;
      patch?: string;
    }[];
  },
  context?: string,
) {
  const prompt = `
You are a Staff Software Engineer performing a Pull Request review.

Review the PR carefully.

Focus on:
- Bugs
- Security vulnerabilities
- Performance issues
- Code quality
- Best practices
- Maintainability

Developer Instructions:
${context || "No additional instructions"}

PR Title:
${prData.title}

PR Description:
${prData.description || "No description"}

Changed Files:

${prData.files
  .map(
    (file) => `
File: ${file.filename}
Status: ${file.status}

Diff:
${file.patch || "No patch available"}

------------------------------------
`,
  )
  .join("\n")}


Return ONLY valid JSON.

{
  "summary": "",
  "overallScore": 0,
  "securityScore": 0,
  "performanceScore": 0,
  "qualityScore": 0,
  "findings": [
    {
      "severity": "Critical | High | Medium | Low",
      "file": "",
      "issue": "",
      "reason": "",
      "suggestion": ""
    }
  ],
  "strengths": [],
  "recommendation": "Approve | Request Changes"
}
`;

  const response = await grok.chat.completions.create({
    model: REVIEW_MODEL,
    response_format: {
      type: "json_object",
    },

    messages: [
      {
        role: "system",
        content:
          "You are an expert GitHub code reviewer with deep experience in TypeScript, Node.js, React, Next.js and backend architecture.",
      },

      {
        role: "user",
        content: prompt,
      },
    ],
  });

  // An empty choices array would otherwise throw before the caller can
  // JSON.parse the result into an empty review.
  return response.choices[0]?.message?.content ?? "{}";
}
