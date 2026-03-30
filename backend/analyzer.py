import json
import re
from google import genai
from google.genai import types


ANALYSIS_SCHEMA = {
    "ats_score": "integer 0-100",
    "overall_verdict": "string — 2-3 sentence executive summary",
    "sections_found": ["list of section names found in the resume"],
    "matched_keywords": ["keywords from JD found in resume"],
    "missing_keywords": ["important JD keywords absent from resume"],
    "strengths": ["list of resume strengths"],
    "weaknesses": ["list of resume weaknesses"],
    "improvements_by_section": {
        "Section Name": ["improvement suggestion 1", "improvement suggestion 2"]
    },
    "before_after_rewrites": [
        {
            "section": "section name",
            "label": "short label, e.g. 'Work Experience bullet'",
            "before": "original text excerpt",
            "after": "improved rewrite using stronger language and JD keywords"
        }
    ],
    "quick_wins": ["short actionable tip 1", "short actionable tip 2"]
}

PROMPT_TEMPLATE = """You are a senior ATS (Applicant Tracking System) expert and professional resume coach with 15 years of experience helping candidates land jobs at top companies.

Carefully analyze the provided resume against the job description. Be honest, thorough, and actionable.

## RESUME TEXT:
{resume_text}

## JOB DESCRIPTION:
{job_description}

## INSTRUCTIONS:
1. Calculate an ATS compatibility score (0-100) based on: keyword match density, formatting quality, relevant experience alignment, skills coverage, and section completeness.
2. Identify ALL sections present in the resume.
3. Extract keywords and skills from the job description, then classify each as matched (in resume) or missing.
4. List concrete strengths with specific evidence from the resume.
5. List honest weaknesses — gaps that could cause rejection.
6. For each resume section, provide 2-4 specific, actionable improvement suggestions.
7. Provide 3-5 before/after rewrite examples that demonstrate how to improve actual lines from the resume using stronger verbs, quantified results, and JD keywords.
8. List 5-8 "quick wins" — changes that can be done in under 5 minutes and will meaningfully boost the score.

## RESPONSE FORMAT:
Respond with ONLY a valid JSON object. No markdown, no code fences, no explanation — just the raw JSON.

The JSON must follow this exact structure:
{schema}
""".strip()


def analyze_resume(resume_text: str, job_description: str, api_key: str) -> dict:
    client = genai.Client(api_key=api_key)

    prompt = PROMPT_TEMPLATE.format(
        resume_text=resume_text.strip(),
        job_description=job_description.strip(),
        schema=json.dumps(ANALYSIS_SCHEMA, indent=2),
    )

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.4,
        ),
    )

    raw = response.text.strip()

    # Strip markdown fences if the model adds them despite instructions
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    data = json.loads(raw)
    return _sanitize(data)


def _sanitize(data: dict) -> dict:
    """Ensure expected keys are present with sensible defaults."""
    defaults = {
        "ats_score": 0,
        "overall_verdict": "",
        "sections_found": [],
        "matched_keywords": [],
        "missing_keywords": [],
        "strengths": [],
        "weaknesses": [],
        "improvements_by_section": {},
        "before_after_rewrites": [],
        "quick_wins": [],
    }
    for key, default in defaults.items():
        if key not in data:
            data[key] = default

    # Clamp score
    data["ats_score"] = max(0, min(100, int(data["ats_score"])))
    return data
