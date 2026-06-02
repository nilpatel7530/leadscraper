from flask import Flask, render_template, request, jsonify, Response, send_file
import os
import json
import csv
from datetime import datetime
import io

import database
import scraper
import ai_extractor

app = Flask(__name__)

# Ensure all directories exist
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATE_DIR = os.path.join(BASE_DIR, 'templates')
STATIC_DIR = os.path.join(BASE_DIR, 'static')
EXPORTS_DIR = os.path.join(BASE_DIR, 'exports')

os.makedirs(TEMPLATE_DIR, exist_ok=True)
os.makedirs(STATIC_DIR, exist_ok=True)
os.makedirs(EXPORTS_DIR, exist_ok=True)

# Ensure exports has a .gitkeep or dummy file
with open(os.path.join(EXPORTS_DIR, '.gitkeep'), 'a') as f:
    pass

# Point flask to templates and static folders
app.template_folder = TEMPLATE_DIR
app.static_folder = STATIC_DIR

# Initialize Database on Startup
database.init_db()

# List of high-ticket B2B niches for lead generation autocomplete (21 categories)
POPULAR_NICHES = [
    "legal services", "home services", "elective medical", "cybersecurity", 
    "wholesale distribution", "renewable energy", "b2b saas", "digital marketing", 
    "specialized staffing", "commercial real estate", "corporate travel", "logistics freight", 
    "wealth management", "facility management", "high-ticket ecommerce", "hrms payroll", 
    "architecture design", "franchise development", "specialized matrimonial", "manufacturing equipment", 
    "event management"
]

def log_lead_to_session_files(lead, timestamp_str):
    """Appends an extracted lead directly to excel-compatible CSV and human-readable text session logs."""
    csv_path = os.path.join(EXPORTS_DIR, 'session_leads.csv')
    txt_path = os.path.join(EXPORTS_DIR, 'session_leads_history.txt')
    
    # 1. CSV Append
    file_exists = os.path.exists(csv_path)
    csv_headers = ["Timestamp", "Business Name", "Business Type", "Contact Person", "Phone", "Email", "Website", "Address", "Niche", "Fit Score", "Reason", "Has Website", "Outreach Pitch Tip", "Pitch Message", "Notes", "Source URL"]
    
    try:
        with open(csv_path, 'a', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            if not file_exists:
                writer.writerow(csv_headers)
            writer.writerow([
                timestamp_str,
                lead.get('business', ''),
                lead.get('business_type', ''),
                lead.get('name', ''),
                lead.get('phone', ''),
                lead.get('email', ''),
                lead.get('website', ''),
                lead.get('address', ''),
                lead.get('niche', ''),
                lead.get('fit_score', 5),
                lead.get('reason', ''),
                "Yes" if lead.get('has_website') == 1 else "No",
                lead.get('outreach_tip', ''),
                lead.get('pitch_message', ''),
                lead.get('notes', ''),
                lead.get('source_url', '')
            ])
    except Exception as e:
        print(f"Error logging to CSV file: {str(e)}")
        
    # 2. Text Log Append
    try:
        with open(txt_path, 'a', encoding='utf-8') as f:
            f.write(f"\n=================== LEAD EXTRACTED ===================\n")
            f.write(f"Date/Time   : {timestamp_str}\n")
            f.write(f"Business    : {lead.get('business', 'N/A')}\n")
            f.write(f"Type        : {lead.get('business_type', 'N/A')}\n")
            f.write(f"Contact     : {lead.get('name', 'N/A')}\n")
            f.write(f"Phone       : {lead.get('phone', 'N/A')}\n")
            f.write(f"Email       : {lead.get('email', 'N/A')}\n")
            f.write(f"Website     : {lead.get('website', 'N/A')}\n")
            f.write(f"Address     : {lead.get('address', 'N/A')}\n")
            f.write(f"Niche       : {lead.get('niche', 'N/A')}\n")
            f.write(f"Fit Score   : {lead.get('fit_score', 5)}/10\n")
            f.write(f"Has Website : {'Yes' if lead.get('has_website') == 1 else 'No'}\n")
            f.write(f"Reason      : {lead.get('reason', 'N/A')}\n")
            f.write(f"Outreach Tip: {lead.get('outreach_tip', 'N/A')}\n")
            f.write(f"Pitch Message:\n{lead.get('pitch_message', 'N/A')}\n")
            f.write(f"Notes       : {lead.get('notes', 'N/A')}\n")
            f.write(f"Source URL  : {lead.get('source_url', 'N/A')}\n")
            f.write(f"======================================================\n")
    except Exception as e:
        print(f"Error logging to TXT file: {str(e)}")

@app.route('/')
def home():
    """Serves the main SPA templates interface."""
    return render_template('index.html')

@app.route('/api/status', methods=['GET'])
def get_status():
    """Pings local LM Studio and returns model name and context limits."""
    online = ai_extractor.is_lm_studio_online()
    if online:
        model_name = ai_extractor.get_loaded_model_info()
        return jsonify({
            "status": "online",
            "model": model_name,
            "context_limit": 131072  # 128K context
        })
    return jsonify({
        "status": "offline",
        "model": "None (Offline)",
        "context_limit": 0
    })

@app.route('/api/niches', methods=['GET'])
def get_niches():
    """Returns the popular niche autocomplete suggestions."""
    return jsonify(POPULAR_NICHES)

@app.route('/api/leads', methods=['GET'])
def get_leads():
    """Fetches leads from SQLite according to filters and sorting."""
    niche = request.args.get('niche')
    min_score = request.args.get('min_score')
    contacted = request.args.get('contacted')
    has_website = request.args.get('has_website')
    search_term = request.args.get('search_term')
    sort_by = request.args.get('sort_by')
    sort_order = request.args.get('sort_order', 'desc')
    sales_status = request.args.get('sales_status')
    
    leads = database.get_all_leads(
        niche=niche,
        min_score=min_score,
        contacted=contacted,
        has_website=has_website,
        search_term=search_term,
        sort_by=sort_by,
        sort_order=sort_order,
        sales_status=sales_status
    )
    
    stats = database.get_lead_stats()
    
    return jsonify({
        "leads": leads,
        "stats": stats
    })

@app.route('/api/leads/<int:lead_id>', methods=['PATCH'])
def update_lead(lead_id):
    """Updates a lead's contacted state, sales stage, follow-up date, or notes."""
    req_data = request.json or {}
    contacted = req_data.get('contacted')
    notes = req_data.get('notes')
    sales_status = req_data.get('sales_status')
    follow_up_date = req_data.get('follow_up_date')
    pitch_message = req_data.get('pitch_message')
    
    updated = database.update_lead(
        lead_id, 
        contacted=contacted, 
        notes=notes, 
        sales_status=sales_status, 
        follow_up_date=follow_up_date,
        pitch_message=pitch_message
    )
    if not updated:
        return jsonify({"error": "Lead not found"}), 404
        
    return jsonify({"success": True, "lead": updated})

@app.route('/api/leads/<int:lead_id>', methods=['DELETE'])
def remove_lead(lead_id):
    """Deletes a lead from the database."""
    success = database.delete_lead(lead_id)
    return jsonify({"success": success})

@app.route('/api/leads/bulk-status', methods=['POST'])
def bulk_update_status():
    """Bulk updates sales status or follow-up date for multiple leads."""
    req_data = request.json or {}
    lead_ids = req_data.get('lead_ids', [])
    sales_status = req_data.get('sales_status')
    follow_up_date = req_data.get('follow_up_date')
    
    if not lead_ids:
        return jsonify({"error": "No lead IDs provided"}), 400
        
    updated_leads = []
    for lid in lead_ids:
        updated = database.update_lead(lid, sales_status=sales_status, follow_up_date=follow_up_date)
        if updated:
            updated_leads.append(updated)
            
    return jsonify({"success": True, "count": len(updated_leads), "leads": updated_leads})

@app.route('/api/leads/<int:lead_id>/generate-pitch', methods=['POST'])
def generate_pitch(lead_id):
    """Triggers dynamic outreach pitch generation for a single lead using Gemma or local template compiler."""
    import requests
    # Fetch lead details from DB first
    conn = database.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM leads WHERE id = ?", (lead_id,))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        return jsonify({"error": "Lead not found"}), 404
        
    lead = dict(row)
    
    # Read optional custom template from request or LocalStorage via frontend
    req_data = request.json or {}
    custom_template = req_data.get('template', '').strip()
    
    pitch_msg = ""
    used_ai = False
    
    # If custom template is provided, compile it locally!
    if custom_template:
        pitch_msg = database.compile_outreach_template(custom_template, lead)
    else:
        # Otherwise, attempt to use LM Studio Gemma 4 MoE if online!
        if ai_extractor.is_lm_studio_online():
            try:
                system_prompt = (
                    "You are a professional B2B cold outreach copywriter representing Nil Patel, a talented full-stack web and AI developer based in Vadodara, India.\n"
                    "Your task is to write a highly compelling, personalized, short, high-converting B2B cold outreach message targeting a specific local prospect.\n\n"
                    "Requirements:\n"
                    "- Keep it short, focused, and under 150-180 words.\n"
                    "- Address them by name if available, otherwise by their business name.\n"
                    "- Dynamically reference their specific niche and their fit score/audit justification.\n"
                    "- Embed their custom outreach tip naturally as a core value proposition.\n"
                    "- Propose showing them a free custom prototype widget in a quick chat.\n"
                    "- Maintain a friendly, helpful, professional, non-spammy tone.\n"
                    "- Do NOT add subject lines, markdown code fences, or placeholders like [Your Name]. Sign off as 'Nil Patel'.\n"
                )
                
                user_prompt = (
                    f"Prospect Niche: {lead.get('niche')}\n"
                    f"Business Name: {lead.get('business')}\n"
                    f"Contact Name: {lead.get('name')}\n"
                    f"Fit Score: {lead.get('fit_score')}/10\n"
                    f"Audit Issue: {lead.get('reason')}\n"
                    f"Outreach Strategy Tip: {lead.get('outreach_tip')}\n\n"
                    "Write the outreach pitch message now."
                )
                
                active_model = ai_extractor.get_loaded_model_info()
                payload = {
                    "model": active_model,
                    "temperature": 0.3,
                    "max_tokens": 1000,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ]
                }
                
                res = requests.post(
                    f"{ai_extractor.LM_STUDIO_API}/chat/completions",
                    json=payload,
                    headers={"Content-Type": "application/json"},
                    timeout=30
                )
                res.raise_for_status()
                pitch_msg = res.json()['choices'][0]['message']['content'].strip()
                used_ai = True
            except Exception as e:
                print(f"Gemma outreach generation failed: {str(e)}. Reverting to fallback compiler.")
                
        # If Gemma is offline or failed, revert to fallback local synthesis compiler!
        if not pitch_msg:
            pitch_msg = database.generate_pitch_message(lead)
            
    # Save the generated pitch back to the database!
    database.update_lead(lead_id, pitch_message=pitch_msg)
    
    return jsonify({
        "success": True,
        "pitch_message": pitch_msg,
        "used_ai": used_ai
    })

@app.route('/api/history', methods=['GET'])
def get_history():
    """Fetches successful search search history dropdown options."""
    history = database.get_search_history()
    return jsonify(history)

@app.route('/api/leads/export', methods=['POST'])
def export_leads():
    """Exports current database snapshot to a direct download CSV attachment."""
    # Retrieve all current leads
    leads = database.get_all_leads()
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    headers = ["ID", "Business Name", "Business Type", "Contact Person", "Phone", "Email", "Website", "Address", "Niche", "Fit Score", "Reason", "Has Website", "Outreach Pitch Tip", "Pitch Message", "Notes", "Source URL", "Scraped At", "Contacted", "Sales Status", "Follow-up Date"]
    writer.writerow(headers)
    
    for lead in leads:
        writer.writerow([
            lead['id'],
            lead['business'],
            lead.get('business_type', ''),
            lead['name'],
            lead['phone'],
            lead['email'],
            lead['website'],
            lead['address'],
            lead['niche'],
            lead['fit_score'],
            lead['reason'],
            "Yes" if lead['has_website'] == 1 else "No",
            lead['outreach_tip'],
            lead.get('pitch_message', ''),
            lead['notes'],
            lead['source_url'],
            lead['scraped_at'],
            "Yes" if lead['contacted'] else "No",
            lead.get('sales_status', 'New'),
            lead.get('follow_up_date', '')
        ])
        
    output.seek(0)
    
    export_file_path = os.path.join(EXPORTS_DIR, 'leads_export.csv')
    try:
        with open(export_file_path, 'w', newline='', encoding='utf-8') as f:
            f.write(output.getvalue())
    except Exception as e:
        print(f"Error saving database backup CSV: {str(e)}")
        
    return send_file(
        io.BytesIO(output.getvalue().encode('utf-8')),
        mimetype='text/csv',
        as_attachment=True,
        download_name=f"nilleads_database_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    )

@app.route('/api/search', methods=['POST'])
def search():
    """Triggers the combined scraping and AI extraction sequence. Streams SSE events to frontend."""
    req_data = request.json or {}
    niche = req_data.get('niche', '').strip()
    location = req_data.get('location', '').strip()
    sources = req_data.get('sources', ['google', 'justdial', 'indiamart'])
    custom_url = req_data.get('custom_url', '').strip()
    thinking_mode = req_data.get('thinking', False)
    
    is_custom_only = len(sources) == 1 and sources[0] == 'custom'
    
    if not niche and not is_custom_only:
        return jsonify({"error": "Niche is required."}), 400
    if not location and not is_custom_only:
        location = "Vadodara, Gujarat"
        
    if 'custom' in sources and not custom_url:
        return jsonify({"error": "A custom URL is required when custom source is selected."}), 400

    def generate_events():
        session_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        # Helper logging yields
        def send_progress(msg, status="progress", tokens=0):
            return f"data: {json.dumps({'status': status, 'message': msg, 'tokens': tokens})}\n\n"
            
        yield send_progress("🚀 NilLeads Engine waking up...")
        
        scraped_text = ""
        resolved_url = custom_url
        
        # Step 1: Scrape
        try:
            yield send_progress(f"🔍 Crawling directories ({', '.join(sources).upper()}) for '{niche}' in '{location}'...")
            scraped_text, resolved_url = scraper.run_combined_lead_scrape(
                sources,
                niche,
                location,
                custom_url=custom_url,
                logger=lambda m, s="progress": send_progress(m, s)
            )
        except Exception as e:
            yield send_progress(f"⚠️ Scraping warning: {str(e)}. Continuing with synthesiser...")
            
        # Context token calculation and trimming
        if scraped_text:
            scraped_text, tokens_used = scraper.manage_context_limit(scraped_text, logger=lambda m, s="progress": send_progress(m, s))
        else:
            tokens_used = 0
            
        yield send_progress(f"📂 Compiled crawled payload size: {len(scraped_text)} characters.", tokens=tokens_used)
        
        # Step 2: AI Extraction / Fallback Synthesis
        leads_list = []
        ai_fallback_triggered = False
        
        if not scraped_text or len(scraped_text.strip()) < 100:
            yield send_progress("⚠️ Search index returned sparse results. Initiating contextual lead synthesizer...")
            leads_list = scraper.generate_contextual_leads(niche, location, logger=lambda m, s="progress": send_progress(m, s))
            ai_fallback_triggered = True
        else:
            yield send_progress(f"🧠 Scraped content loaded ({tokens_used} tokens). Calling local Gemma 4 E4B...")
            try:
                leads_list = ai_extractor.extract_leads_gemma4(
                    scraped_text, 
                    niche, 
                    location, 
                    thinking_mode=thinking_mode,
                    logger=lambda m: None
                )
            except ConnectionError:
                yield send_progress("⚠️ LM Studio local API offline! Reverting to local synthesizer engine...")
                leads_list = scraper.generate_contextual_leads(niche, location, logger=lambda m: None)
                ai_fallback_triggered = True
            except Exception as e:
                yield send_progress(f"⚠️ Extraction parsing warning: {str(e)}. Synthesizing leads...")
                leads_list = scraper.generate_contextual_leads(niche, location, logger=lambda m: None)
                ai_fallback_triggered = True
                
        # Step 3: Process, save, and stream lead list
        if leads_list:
            # Deduplicate incoming leads list (case-insensitive business names, phone, email, website)
            unique_candidates = []
            seen_names = set()
            seen_phones = set()
            seen_emails = set()
            seen_webs = set()
            
            yield send_progress("🔍 Performing strict, multi-tiered duplicate auditing...")
            
            for l in leads_list:
                # Basic values
                biz_name = l.get('business', '')
                phone = l.get('phone', '')
                email = l.get('email', '')
                website = l.get('website', '')
                
                # Normalizations
                norm_biz = database.normalize_business_name(biz_name)
                norm_phone = database.normalize_phone(phone)
                norm_email = email.strip().lower()
                norm_web = database.normalize_website(website)
                
                # Check for duplicate properties within this scraped session batch
                is_dup = False
                if norm_biz:
                    if norm_biz in seen_names:
                        is_dup = True
                    seen_names.add(norm_biz)
                if norm_phone:
                    if norm_phone in seen_phones:
                        is_dup = True
                    seen_phones.add(norm_phone)
                if norm_email:
                    if norm_email in seen_emails:
                        is_dup = True
                    seen_emails.add(norm_email)
                if norm_web:
                    if norm_web in seen_webs:
                        is_dup = True
                    seen_webs.add(norm_web)
                    
                # Check for duplicates already inside SQLite database
                if not is_dup and database.check_duplicate(l):
                    is_dup = True
                    
                if not is_dup:
                    unique_candidates.append(l)
                    
            leads_list = unique_candidates
            
            original_len = len(leads_list)
            # Supplement leads to reach at least 20 100% unique, brand-new leads
            leads_list = scraper.supplement_leads(leads_list, niche, location, target_count=20)
            supplemented_len = len(leads_list)
            if supplemented_len > original_len:
                yield send_progress(f"✨ Dynamically generated and supplemented {supplemented_len - original_len} 100% unique, brand-new leads for '{niche}' in '{location}'!")
        
        saved_count = 0
        duplicate_count = 0
        
        if not leads_list:
            yield send_progress("❌ Could not extract or generate any leads for this query.", status="error")
            return
            
        yield send_progress(f"📂 Extracted {len(leads_list)} total candidate leads. Filtering duplicates...")
        
        for idx, lead in enumerate(leads_list):
            # Inject source url and notes if missing
            if not lead.get('source_url'):
                lead['source_url'] = resolved_url
            if not lead.get('niche'):
                lead['niche'] = niche.capitalize() if niche else "Custom"
            if not lead.get('notes'):
                lead['notes'] = ""
                
            # Attempt to save
            saved_lead = database.save_lead(lead)
            
            if saved_lead:
                saved_count += 1
                # Log to session CSV and text history files
                log_lead_to_session_files(saved_lead, session_timestamp)
                
                # Stream this lead to the frontend card feed
                yield f"data: {json.dumps({'status': 'lead', 'data': saved_lead})}\n\n"
            else:
                duplicate_count += 1
                yield send_progress(f"⏩ Duplicate skipped: '{lead.get('business', 'Unknown')}' already exists in DB.")
                
        # Save Search History if any valid leads were generated
        if saved_count > 0 or duplicate_count > 0:
            database.add_search_history(niche, location)
            
        # Final Event
        summary_msg = f"✅ Scan Complete! Extracted: {saved_count} new leads | Skipped: {duplicate_count} duplicates."
        if ai_fallback_triggered:
            summary_msg += " (Used local synthesiser fallback)"
            
        yield f"data: {json.dumps({'status': 'complete', 'message': summary_msg, 'new_count': saved_count, 'dup_count': duplicate_count})}\n\n"
        
    return Response(generate_events(), mimetype='text/event-stream')

if __name__ == '__main__':
    print("==================================================")
    print("   NilLeads Server Running: http://127.0.0.1:5000 ")
    print("==================================================")
    app.run(host='127.0.0.1', port=5000, debug=True)
