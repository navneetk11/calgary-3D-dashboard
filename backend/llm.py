import requests
import os
import json
import re
from dotenv import load_dotenv

load_dotenv()
HF_API_KEY = os.getenv("HF_API_KEY")

def parse_query_with_llm(user_query, buildings):
    prompt = f"""You are a building filter assistant. Given a natural language query, return ONLY a JSON object with:
- "attribute": one of ["height", "height_feet", "zoning", "zoning_code", "name", "levels", "amenity", "assessed_value"]
- "operator": one of [">", "<", ">=", "<=", "==", "contains"]
- "value": the value to compare (number or string, no $ or commas)

Examples:
"buildings over 100 feet" -> {{"attribute": "height_feet", "operator": ">", "value": 100}}
"taller than 30 meters" -> {{"attribute": "height", "operator": ">", "value": 30}}
"commercial buildings" -> {{"attribute": "zoning", "operator": "contains", "value": "commercial"}}
"show buildings in RC-G zoning" -> {{"attribute": "zoning_code", "operator": "contains", "value": "RC-G"}}
"buildings less than $500,000 in value" -> {{"attribute": "assessed_value", "operator": "<", "value": 500000}}
"buildings over $1,000,000" -> {{"attribute": "assessed_value", "operator": ">", "value": 1000000}}
"more than 5 floors" -> {{"attribute": "levels", "operator": ">", "value": 5}}
"residential buildings" -> {{"attribute": "zoning", "operator": "contains", "value": "residential"}}

Query: "{user_query}"
JSON:"""

    filter_obj = None

    if HF_API_KEY:
        try:
            response = requests.post(
                "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3",
                headers={"Authorization": f"Bearer {HF_API_KEY}"},
                json={"inputs": prompt, "parameters": {"max_new_tokens": 80, "temperature": 0.1}},
                timeout=20
            )
            result = response.json()
            text = ""
            if isinstance(result, list) and result:
                text = result[0].get("generated_text", "")
            elif isinstance(result, dict):
                text = result.get("generated_text", "")

            # Extract the JSON part after the prompt
            after_prompt = text[len(prompt):] if len(text) > len(prompt) else text
            json_match = re.search(r'\{[^{}]+\}', after_prompt)
            if json_match:
                filter_obj = json.loads(json_match.group())
                print(f"LLM parsed: {filter_obj}")
        except Exception as e:
            print(f"HF API error: {e}, using fallback")

    # Always fallback if LLM fails
    if not filter_obj:
        filter_obj = rule_based_parse(user_query)
        print(f"Rule-based parsed: {filter_obj}")

    if not filter_obj:
        return {"error": "Could not understand query", "matched_ids": [], "count": 0}

    matched = apply_filter(buildings, filter_obj)
    return {
        "filter": filter_obj,
        "matched_ids": [b["id"] for b in matched],
        "count": len(matched)
    }


def rule_based_parse(query):
    """Robust fallback covering all required query types."""
    q = query.lower().strip()

    # ── Assessed value (handles $500,000 / 500000 / $1.5M) ──
    money = re.search(r'\$?([\d,]+\.?\d*)\s*([mk]?)\s*(million|thousand)?', q)
    if money and any(w in q for w in ["value", "worth", "assessed", "cost", "price", "$"]):
        raw = money.group(1).replace(",", "")
        multiplier = money.group(2).lower() or money.group(3) or ""
        amount = float(raw)
        if multiplier in ["m", "million"]:
            amount *= 1_000_000
        elif multiplier in ["k", "thousand"]:
            amount *= 1_000

        if any(w in q for w in ["less than", "under", "below", "cheaper", "lower"]):
            return {"attribute": "assessed_value", "operator": "<", "value": amount}
        elif any(w in q for w in ["more than", "over", "above", "greater", "higher"]):
            return {"attribute": "assessed_value", "operator": ">", "value": amount}

    # ── Height in feet ──
    m = re.search(r'(\d+)\s*(feet|ft|foot)', q)
    if m:
        val = float(m.group(1))
        if any(w in q for w in ["over", "taller", "higher", "more than", "above", "greater"]):
            return {"attribute": "height_feet", "operator": ">", "value": val}
        if any(w in q for w in ["under", "shorter", "lower", "less than", "below"]):
            return {"attribute": "height_feet", "operator": "<", "value": val}

    # ── Height in meters ──
    m = re.search(r'(\d+)\s*(meter|metre|m\b)', q)
    if m:
        val = float(m.group(1))
        if any(w in q for w in ["over", "taller", "higher", "more than", "above"]):
            return {"attribute": "height", "operator": ">", "value": val}
        if any(w in q for w in ["under", "shorter", "lower", "less than", "below"]):
            return {"attribute": "height", "operator": "<", "value": val}

    # ── Generic number (assume height) ──
    m = re.search(r'(taller|higher|over|more than|above)\s+(\d+)', q)
    if m:
        return {"attribute": "height", "operator": ">", "value": float(m.group(2))}
    m = re.search(r'(shorter|lower|under|less than|below)\s+(\d+)', q)
    if m:
        return {"attribute": "height", "operator": "<", "value": float(m.group(2))}

    # ── Zoning code (e.g. RC-G, M-C1) ──
    m = re.search(r'\b([A-Z]{1,3}-[A-Z]\d*)\b', query)
    if m:
        return {"attribute": "zoning_code", "operator": "contains", "value": m.group(1)}

    # ── Building type/zoning keywords ──
    for keyword in ["commercial", "residential", "retail", "office",
                    "industrial", "apartment", "mixed"]:
        if keyword in q:
            return {"attribute": "zoning", "operator": "contains", "value": keyword}

    # ── Floors/levels ──
    m = re.search(r'(more than|over|above)\s+(\d+)\s*(floor|level|storey|story)', q)
    if m:
        return {"attribute": "levels", "operator": ">", "value": float(m.group(2))}

    return None


def apply_filter(buildings, filter_obj):
    attr = filter_obj.get("attribute")
    op = filter_obj.get("operator")
    value = filter_obj.get("value")
    matched = []

    for b in buildings:
        bval = b.get(attr)
        if bval is None:
            continue
        try:
            if op in [">", "<", ">=", "<="]:
                bval_f = float(bval)
                val_f = float(value)
                if op == ">" and bval_f > val_f: matched.append(b)
                elif op == "<" and bval_f < val_f: matched.append(b)
                elif op == ">=" and bval_f >= val_f: matched.append(b)
                elif op == "<=" and bval_f <= val_f: matched.append(b)
            elif op == "==":
                if str(bval).lower() == str(value).lower(): matched.append(b)
            elif op == "contains":
                if str(value).lower() in str(bval).lower(): matched.append(b)
        except:
            continue
    return matched