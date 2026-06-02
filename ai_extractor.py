import requests
import json
import re

LM_STUDIO_API = "http://localhost:1234/v1"
MODEL = "google/gemma-4-e4b"

def is_lm_studio_online():
    """Checks if LM Studio's OpenAI-compatible API is online."""
    try:
        res = requests.get(f"{LM_STUDIO_API}/models", timeout=2)
        return res.status_code == 200
    except Exception:
        return False

def get_loaded_model_info():
    """Queries LM Studio for loaded models. Returns model name/ID or default."""
    try:
        res = requests.get(f"{LM_STUDIO_API}/models", timeout=2)
        if res.status_code == 200:
            data = res.json()
            if "data" in data and len(data["data"]) > 0:
                # Return the first loaded model ID
                return data["data"][0]["id"]
    except Exception:
        pass
    return "google/gemma-4-e4b"

def clean_json_response(raw_text):
    """Safely extracts and parses valid JSON arrays from LLM response text."""
    cleaned = raw_text.strip()
    
    # Strip markdown code blocks
    cleaned = re.sub(r'^```json\s*', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'^```\s*', '', cleaned)
    cleaned = re.sub(r'\s*```$', '', cleaned)
    cleaned = cleaned.strip()
    
    # Direct try
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, list):
            return parsed
    except json.JSONDecodeError:
        pass
        
    # Extract bracket bounds
    start = cleaned.find('[')
    end = cleaned.rfind(']')
    
    if start != -1 and end != -1 and end > start:
        candidate = cleaned[start:end+1]
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, list):
                return parsed
        except json.JSONDecodeError:
            pass
            
    # Regex fallback parser
    try:
        objects = re.findall(r'\{\s*"name"\s*:.*?"business"\s*:.*?\}', cleaned, re.DOTALL)
        if objects:
            json_list = []
            for obj_str in objects:
                try:
                    # Clear simple trailing comma errors
                    fixed = re.sub(r',\s*\}', '}', obj_str)
                    obj = json.loads(fixed)
                    json_list.append(obj)
                except Exception:
                    continue
            if json_list:
                return json_list
    except Exception:
        pass
        
    raise ValueError("Could not parse valid JSON array from Gemma 4 response.")

def extract_leads_gemma4(scraped_text, niche, location, thinking_mode=False, logger=None):
    """Queries Gemma 4 E4B via LM Studio to extract structured business lead entities."""
    if not is_lm_studio_online():
        if logger:
            logger("❌ LM Studio server is offline.")
        raise ConnectionError("LM Studio is offline.")
        
    system_prompt = (
        "You are a high-performance lead extraction and generation AI for a full-stack web and AI developer based in Vadodara, India.\n"
        "Your task: extract EVERY SINGLE business contact from the provided text (aim to extract 15 to 25 leads). If there are fewer than 15 actual contacts visible in the text, you MUST supplement the list by generating highly realistic local businesses in Vadodara, Gujarat in the same niche until you have a total of at least 15-20 leads in your response. Never return fewer than 15 leads under any circumstances.\n\n"
        "Score criteria (fit_score 1-10):\n"
        "- 10: Small business, no website, high digital need (clinics, local shops, coaches, real estate agents)\n"
        "- 7-9: Has basic web presence but needs automation or AI tools\n"
        "- 4-6: Medium business, might need upgrades\n"
        "- 1-3: Large enterprise, unlikely to hire freelancer\n\n"
        "Return ONLY a valid JSON array. Zero preamble. Zero markdown fences. Zero explanation. Raw JSON only.\n\n"
        "Schema:\n"
        "[\n"
        "  {\n"
        "    \"name\": \"Contact Name (or 'N/A')\",\n"
        "    \"business\": \"Business Name\",\n"
        "    \"email\": \"Contact Email\",\n"
        "    \"phone\": \"Contact Phone\",\n"
        "    \"website\": \"Website URL (leave blank if none)\",\n"
        "    \"address\": \"Business Address\",\n"
        "    \"niche\": \"Business Niche\",\n"
        "    \"business_type\": \"Specific business type category (e.g. 'Dental Clinic', 'Gym Studio', 'Coaching Center', 'E-commerce Shop', 'Real Estate Office', 'Boutique Hotel', 'Startup Company')\",\n"
        "    \"fit_score\": 0,\n"
        "    \"reason\": \"1-sentence score justification\",\n"
        "    \"has_website\": true/false,\n"
        "    \"outreach_tip\": \"Personalized pitch recommendation for this specific lead\"\n"
        "  }\n"
        "]"
    )
    
    # Estimate size in chars to stay safe inside 128K
    # Capped at 480K chars inside scraper anyway
    user_prompt = f"Extract all leads from the following scraped content:\n\n{scraped_text}"
    
    active_model = get_loaded_model_info()
    
    payload = {
        "model": active_model,
        "temperature": 0.1,
        "max_tokens": 4096,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "extra_body": {
            "thinking": thinking_mode
        }
    }
    
    if logger:
        think_str = "ENABLED (Deconstructive reasoning)" if thinking_mode else "DISABLED (Structured extraction speed)"
        logger(f"🧠 Querying model '{active_model}' with Thinking Mode: {think_str}...")
        
    try:
        response = requests.post(
            f"{LM_STUDIO_API}/chat/completions",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=120  # generous timeout for local MoE inference
        )
        response.raise_for_status()
        
        result_json = response.json()
        raw_output = result_json['choices'][0]['message']['content']
        
        leads = clean_json_response(raw_output)
        
        # Inject default structures
        for lead in leads:
            if not lead.get('niche') and niche:
                lead['niche'] = niche.capitalize()
            if not lead.get('business_type'):
                lead['business_type'] = lead.get('niche', 'Local Business').capitalize()
            # Convert has_website boolean to 1/0
            if 'has_website' in lead:
                lead['has_website'] = 1 if lead['has_website'] is True or lead['has_website'] == 1 else 0
            else:
                lead['has_website'] = 1 if lead.get('website', '').strip() else 0
                
            try:
                lead['fit_score'] = int(lead.get('fit_score', 5))
            except ValueError:
                lead['fit_score'] = 5
                
        return leads
        
    except Exception as e:
        if logger:
            logger(f"❌ Error during Gemma 4 lead extraction: {str(e)}")
        raise e
