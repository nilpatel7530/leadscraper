import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'leads.db')

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initializes the database and creates leads table and search history table with new schema."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create leads table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            business TEXT,
            email TEXT,
            phone TEXT,
            website TEXT,
            address TEXT,
            niche TEXT,
            fit_score INTEGER,
            reason TEXT,
            has_website INTEGER DEFAULT 0,
            outreach_tip TEXT,
            source_url TEXT,
            scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            contacted INTEGER DEFAULT 0,
            notes TEXT,
            business_type TEXT,
            pitch_message TEXT,
            sales_status TEXT DEFAULT 'New',
            follow_up_date TEXT DEFAULT ''
        )
    ''')
    
    # Check if business_type column exists (dynamic migration for existing leads.db files)
    cursor.execute("PRAGMA table_info(leads)")
    columns = [row['name'] for row in cursor.fetchall()]
    if 'business_type' not in columns:
        cursor.execute("ALTER TABLE leads ADD COLUMN business_type TEXT")
    if 'pitch_message' not in columns:
        cursor.execute("ALTER TABLE leads ADD COLUMN pitch_message TEXT")
    if 'sales_status' not in columns:
        cursor.execute("ALTER TABLE leads ADD COLUMN sales_status TEXT DEFAULT 'New'")
    if 'follow_up_date' not in columns:
        cursor.execute("ALTER TABLE leads ADD COLUMN follow_up_date TEXT DEFAULT ''")
        
    # Migrate old contacted binary status to sales_status backward-compatibly
    cursor.execute("UPDATE leads SET sales_status = 'Pitch Sent' WHERE contacted = 1 AND (sales_status IS NULL OR sales_status = '' OR sales_status = 'New')")
    cursor.execute("UPDATE leads SET sales_status = 'New' WHERE contacted = 0 AND (sales_status IS NULL OR sales_status = '')")
    cursor.execute("UPDATE leads SET sales_status = 'New' WHERE sales_status IS NULL")
    cursor.execute("UPDATE leads SET follow_up_date = '' WHERE follow_up_date IS NULL")
    
    # Create search history table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS search_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            niche TEXT,
            location TEXT,
            searched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    conn.commit()
    conn.close()

def normalize_phone(phone_str):
    """Removes all non-numeric characters and matches the last 10 digits for standardized comparison."""
    if not phone_str:
        return ""
    import re
    digits = re.sub(r'\D', '', phone_str)
    if len(digits) >= 10:
        return digits[-10:]
    return digits

def normalize_business_name(name):
    """Normalizes a business name by lowercasing, stripping punctuation, and squashing multiple spaces."""
    if not name:
        return ""
    import re
    name = name.lower().strip()
    name = re.sub(r'[^\w\s]', '', name)
    name = re.sub(r'\s+', ' ', name)
    return name.strip()

def normalize_website(url):
    """Strips protocols, subdomains, and trailing slashes for standard URL comparison."""
    if not url:
        return ""
    import re
    url = url.lower().strip()
    url = re.sub(r'^https?://', '', url)
    url = re.sub(r'^www\.', '', url)
    url = url.rstrip('/')
    return url

def check_duplicate(lead):
    """
    Checks if a lead already exists in SQLite by email, website, phone, or business name + niche.
    Utilizes advanced formatting-agnostic normalization to prevent bypasses.
    """
    business = lead.get('business', '').strip()
    phone = lead.get('phone', '').strip()
    email = lead.get('email', '').strip()
    website = lead.get('website', '').strip()
    niche = lead.get('niche', '').strip()
    
    norm_phone = normalize_phone(phone)
    norm_email = email.lower().strip()
    norm_web = normalize_website(website)
    norm_biz = normalize_business_name(business)
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Check phone duplicate (formatting-agnostic)
    if norm_phone and len(norm_phone) >= 7:
        cursor.execute("SELECT phone FROM leads WHERE phone IS NOT NULL AND phone != ''")
        for row in cursor.fetchall():
            if normalize_phone(row['phone']) == norm_phone:
                conn.close()
                return True
                
    # 2. Check email duplicate (case-insensitive)
    if norm_email and len(norm_email) > 3:
        cursor.execute("SELECT id FROM leads WHERE LOWER(email) = LOWER(?)", (norm_email,))
        if cursor.fetchone():
            conn.close()
            return True
            
    # 3. Check website duplicate (normalization-agnostic)
    if norm_web and len(norm_web) > 4:
        cursor.execute("SELECT website FROM leads WHERE website IS NOT NULL AND website != ''")
        for row in cursor.fetchall():
            if normalize_website(row['website']) == norm_web:
                conn.close()
                return True
                
    # 4. Check business name + niche duplicate (advanced normalization)
    if norm_biz:
        cursor.execute("SELECT business FROM leads WHERE LOWER(niche) = LOWER(?)", (niche.lower(),))
        for row in cursor.fetchall():
            if normalize_business_name(row['business']) == norm_biz:
                conn.close()
                return True
                
    conn.close()
    return False

def generate_pitch_message(lead):
    """Generates a highly personalized, high-converting B2B outreach pitch message."""
    name = lead.get('name', '').strip()
    business = lead.get('business', '').strip()
    niche = lead.get('niche', '').strip().lower()
    outreach_tip = lead.get('outreach_tip', '').strip()
    
    salutation = f"Hi {name}" if name and name != "N/A" else f"Hi team at {business}"
    
    pitch = (
        f"{salutation},\n\n"
        f"My name is Nil, a full-stack developer specializing in digital automation for {niche} businesses.\n\n"
        f"I was auditing local prospects and found {business}. {outreach_tip}\n\n"
        "I've already prepared a working custom prototype tailored to your setup. "
        "Would you be open to a quick 5-minute call or chat this week to see it?\n\n"
        "Best regards,\n"
        "Nil Patel"
    )
    return pitch

def compile_outreach_template(template_str, lead):
    """Compiles a template string by replacing placeholders with lead data values."""
    if not template_str:
        return ""
    
    placeholders = {
        "{name}": lead.get('name', 'N/A') if lead.get('name') and lead.get('name') != 'N/A' else 'prospect',
        "{business}": lead.get('business', 'N/A'),
        "{niche}": lead.get('niche', 'N/A').lower() if lead.get('niche') else 'N/A',
        "{outreach_tip}": lead.get('outreach_tip', 'N/A'),
        "{website}": lead.get('website', 'N/A'),
        "{address}": lead.get('address', 'N/A'),
        "{fit_score}": str(lead.get('fit_score', 5))
    }
    
    compiled = template_str
    for k, v in placeholders.items():
        compiled = compiled.replace(k, v)
        
    return compiled

def save_lead(lead):
    """Saves a lead to SQLite. Implements duplicate checking: skips if phone or email is already registered."""
    if check_duplicate(lead):
        return None
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    has_web_val = 1 if lead.get('has_website') is True or lead.get('has_website') == 1 else 0
    if lead.get('website', '').strip() and not lead.get('has_website'):
        # Safety fallback
        has_web_val = 1
        
    # Determine the pitch message
    pitch_msg = lead.get('pitch_message', '').strip()
    if not pitch_msg:
        pitch_msg = generate_pitch_message(lead)
        
    status = lead.get('sales_status', 'New').strip()
    if not status:
        status = 'New'
        
    # Sync contacted binary status with the sales status
    contacted_val = 1 if status in ['Pitch Sent', 'Replied', 'Meeting Booked', 'Closed Won'] else 0
    follow_up = lead.get('follow_up_date', '').strip()
        
    cursor.execute('''
        INSERT INTO leads (name, business, email, phone, website, address, niche, fit_score, reason, has_website, outreach_tip, source_url, notes, business_type, pitch_message, sales_status, follow_up_date, contacted)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        lead.get('name', ''),
        lead.get('business', ''),
        lead.get('email', ''),
        lead.get('phone', ''),
        lead.get('website', ''),
        lead.get('address', ''),
        lead.get('niche', ''),
        lead.get('fit_score', 5),
        lead.get('reason', ''),
        has_web_val,
        lead.get('outreach_tip', ''),
        lead.get('source_url', ''),
        lead.get('notes', ''),
        lead.get('business_type', ''),
        pitch_msg,
        status,
        follow_up,
        contacted_val
    ))
    
    lead_id = cursor.lastrowid
    conn.commit()
    
    # Fetch and return the newly inserted lead
    cursor.execute("SELECT * FROM leads WHERE id = ?", (lead_id,))
    new_lead = dict(cursor.fetchone())
    conn.close()
    return new_lead

def get_all_leads(niche=None, min_score=None, contacted=None, has_website=None, search_term=None, sort_by=None, sort_order='desc', sales_status=None):
    """Fetches all leads applying filters for niche, score, contacted status, website presence, and sales pipeline status."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = "SELECT * FROM leads WHERE 1=1"
    params = []
    
    if niche and niche.strip():
        query += " AND LOWER(niche) = LOWER(?)"
        params.append(niche.strip())
        
    if min_score is not None:
        try:
            # support score bands: e.g. min_score = 8 (for 8-10), 5 (for 5-7), 1 (for 1-4)
            score_val = int(min_score)
            if score_val == 8:
                query += " AND fit_score >= 8"
            elif score_val == 5:
                query += " AND fit_score >= 5 AND fit_score <= 7"
            elif score_val == 1:
                query += " AND fit_score >= 1 AND fit_score <= 4"
            else:
                query += " AND fit_score >= ?"
                params.append(score_val)
        except ValueError:
            pass
            
    if contacted is not None:
        try:
            query += " AND contacted = ?"
            params.append(int(contacted))
        except ValueError:
            pass
            
    if sales_status and sales_status.strip():
        query += " AND sales_status = ?"
        params.append(sales_status.strip())
            
    if has_website is not None:
        try:
            query += " AND has_website = ?"
            params.append(int(has_website))
        except ValueError:
            pass
            
    if search_term and search_term.strip():
        query += " AND (name LIKE ? OR business LIKE ? OR address LIKE ? OR reason LIKE ? OR outreach_tip LIKE ? OR notes LIKE ?)"
        term = f"%{search_term.strip()}%"
        params.extend([term, term, term, term, term, term])
        
    # Order sorting
    allowed_sort_columns = ['id', 'name', 'business', 'fit_score', 'scraped_at', 'contacted', 'niche', 'sales_status']
    if sort_by in allowed_sort_columns:
        order = 'ASC' if sort_order.lower() == 'asc' else 'DESC'
        query += f" ORDER BY {sort_by} {order}"
    else:
        query += " ORDER BY scraped_at DESC"
        
    cursor.execute(query, params)
    rows = cursor.fetchall()
    leads = [dict(row) for row in rows]
    conn.close()
    return leads

def update_lead(lead_id, contacted=None, notes=None, sales_status=None, follow_up_date=None, pitch_message=None):
    """Updates a lead's contacted status, custom inline notes, sales stage, follow-up date, or outreach pitch."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    update_fields = []
    params = []
    
    # Dual-compatible sync between sales_status and contacted binary
    if sales_status is not None:
        update_fields.append("sales_status = ?")
        params.append(sales_status)
        contacted_val = 1 if sales_status in ['Pitch Sent', 'Replied', 'Meeting Booked', 'Closed Won'] else 0
        update_fields.append("contacted = ?")
        params.append(contacted_val)
    elif contacted is not None:
        update_fields.append("contacted = ?")
        params.append(int(contacted))
        status_val = 'Pitch Sent' if int(contacted) == 1 else 'New'
        update_fields.append("sales_status = ?")
        params.append(status_val)
        
    if notes is not None:
        update_fields.append("notes = ?")
        params.append(notes)
        
    if follow_up_date is not None:
        update_fields.append("follow_up_date = ?")
        params.append(follow_up_date)
        
    if pitch_message is not None:
        update_fields.append("pitch_message = ?")
        params.append(pitch_message)
        
    if not update_fields:
        conn.close()
        return None
        
    params.append(lead_id)
    query = f"UPDATE leads SET {', '.join(update_fields)} WHERE id = ?"
    
    cursor.execute(query, params)
    conn.commit()
    
    # Fetch updated
    cursor.execute("SELECT * FROM leads WHERE id = ?", (lead_id,))
    updated_lead = cursor.fetchone()
    conn.close()
    
    return dict(updated_lead) if updated_lead else None

def delete_lead(lead_id):
    """Deletes a lead from the database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM leads WHERE id = ?", (lead_id,))
    conn.commit()
    conn.close()
    return True

def add_search_history(niche, location):
    """Adds a search search query to history if it doesn't already exist recently."""
    if not niche or not location:
        return
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute(
        "SELECT id FROM search_history WHERE LOWER(niche) = LOWER(?) AND LOWER(location) = LOWER(?)",
        (niche.strip(), location.strip())
    )
    if cursor.fetchone():
        cursor.execute(
            "UPDATE search_history SET searched_at = CURRENT_TIMESTAMP WHERE LOWER(niche) = LOWER(?) AND LOWER(location) = LOWER(?)",
            (niche.strip(), location.strip())
        )
    else:
        cursor.execute(
            "INSERT INTO search_history (niche, location) VALUES (?, ?)",
            (niche.strip(), location.strip())
        )
        
    conn.commit()
    conn.close()

def get_search_history(limit=10):
    """Fetches the latest search search history entries."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT niche, location FROM search_history ORDER BY searched_at DESC LIMIT ?", (limit,))
    rows = cursor.fetchall()
    history = [dict(row) for row in rows]
    conn.close()
    return history

def get_lead_stats():
    """Computes total, hot, contacted counts, pipeline counts and conversion percentage."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) FROM leads")
    total = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM leads WHERE fit_score >= 8")
    hot = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM leads WHERE fit_score >= 5 AND fit_score <= 7")
    warm = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM leads WHERE fit_score >= 1 AND fit_score <= 4")
    cold = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM leads WHERE contacted = 1")
    contacted = cursor.fetchone()[0]
    
    # Sales CRM Pipeline stages counts
    cursor.execute("SELECT COUNT(*) FROM leads WHERE sales_status = 'New'")
    new_cnt = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM leads WHERE sales_status = 'Pitch Sent'")
    sent_cnt = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM leads WHERE sales_status = 'Replied'")
    replied_cnt = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM leads WHERE sales_status = 'Meeting Booked'")
    booked_cnt = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM leads WHERE sales_status = 'Closed Won'")
    closed_cnt = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM leads WHERE sales_status = 'Not Interested'")
    passed_cnt = cursor.fetchone()[0]
    
    conversion = 0.0
    if total > 0:
        conversion = round((contacted / total) * 100, 1)
        
    conn.close()
    return {
        "total": total,
        "hot": hot,
        "warm": warm,
        "cold": cold,
        "contacted": contacted,
        "conversion_pct": conversion,
        "new": new_cnt,
        "pitch_sent": sent_cnt,
        "replied": replied_cnt,
        "booked": booked_cnt,
        "closed": closed_cnt,
        "passed": passed_cnt
    }
