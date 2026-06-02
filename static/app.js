/* NilLeads Frontend Logic Orchestrator */

let currentSortColumn = 'scraped_at';
let currentSortOrder = 'desc';
let statusPollInterval = null;
let selectedLeadIds = new Set();
let activeSource = 'google';
let isThinkingMode = false;
let notesDebounceTimers = {};

// Initialize Widescreen Light/Dark theme immediately to prevent color flashes
const savedTheme = localStorage.getItem('theme') || 'dark';
if (savedTheme === 'light') {
    document.body.setAttribute('data-theme', 'light');
} else {
    document.body.removeAttribute('data-theme');
}

document.addEventListener('DOMContentLoaded', () => {
    // Sync theme UI button icons/text on load
    updateThemeUI(savedTheme);
    
    // Set default location
    document.getElementById('location-input').value = "Vadodara, Gujarat";
    
    // Start LM Studio Status poller
    pollLmStudioStatus();
    statusPollInterval = setInterval(pollLmStudioStatus, 5000);
    
    // Initialize Custom URL toggle visibility
    toggleCustomUrlCheckbox();
    
    // Setup Thinking Toggle
    setupThinkingToggle();
    
    // Fetch initial database records
    fetchLeads();
    
    // Bind autocomplete niche list
    setupNicheAutocomplete();
    
    // Bind search history lists
    setupHistoryDropdowns();
    
    // Initialize Folding Analytics Dashboard Panel state from LocalStorage
    const isCollapsed = localStorage.getItem('analytics_collapsed') === 'true';
    if (isCollapsed) {
        const content = document.getElementById('analytics-content');
        const chevron = document.getElementById('analytics-chevron');
        if (content && chevron) {
            content.style.maxHeight = '0px';
            chevron.setAttribute('data-lucide', 'chevron-down');
            lucide.createIcons();
        }
    }
});

// 1. Setup Custom URL Checkbox Toggle
function toggleCustomUrlCheckbox() {
    const customCheckbox = document.getElementById('src-custom');
    const urlGroup = document.getElementById('custom-url-group');
    const urlInput = document.getElementById('custom-url-input');
    
    if (customCheckbox && customCheckbox.checked) {
        urlGroup.style.display = 'flex';
        urlInput.required = true;
    } else {
        urlGroup.style.display = 'none';
        if (urlInput) {
            urlInput.required = false;
            urlInput.value = '';
        }
    }
}

// 2. Setup Thinking Mode Toggle
function setupThinkingToggle() {
    const toggle = document.getElementById('thinking-toggle');
    toggle.addEventListener('click', () => {
        isThinkingMode = !isThinkingMode;
        if (isThinkingMode) {
            toggle.classList.add('active');
            toggle.querySelector('span').textContent = 'Thinking: ON';
        } else {
            toggle.classList.remove('active');
            toggle.querySelector('span').textContent = 'Thinking: OFF';
        }
    });
}

// 3. Poll LM Studio status
async function pollLmStudioStatus() {
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    const pill = document.getElementById('status-pill');
    
    try {
        const res = await fetch('/api/status');
        const data = await res.json();
        
        if (data.status === 'online') {
            dot.className = 'status-dot online';
            text.textContent = `Gemma 4: Online`;
            pill.title = `Loaded Model: ${data.model} | Context: ${data.context_limit} tokens`;
        } else {
            dot.className = 'status-dot offline';
            text.textContent = 'Gemma 4: Offline';
            pill.title = 'LM Studio local server is offline.';
        }
    } catch (err) {
        dot.className = 'status-dot offline';
        text.textContent = 'Gemma 4: Offline';
    }
}

// 4. Autocomplete Niche Lists
async function setupNicheAutocomplete() {
    const nicheInput = document.getElementById('niche-input');
    const nicheHistory = document.getElementById('niche-history');
    
    try {
        const res = await fetch('/api/niches');
        const popularNiches = await res.json();
        
        nicheInput.addEventListener('input', () => {
            const val = nicheInput.value.trim().toLowerCase();
            nicheHistory.innerHTML = '';
            
            if (!val) {
                nicheHistory.style.display = 'none';
                return;
            }
            
            // Filter popular niches
            const matches = popularNiches.filter(n => n.includes(val));
            if (matches.length === 0) {
                nicheHistory.style.display = 'none';
                return;
            }
            
            matches.forEach(match => {
                const el = document.createElement('div');
                el.className = 'history-item';
                el.innerHTML = `
                    <span class="item-text">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px; color: var(--accent);"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
                        ${match}
                    </span>
                    <span class="loc">Popular</span>
                `;
                el.onclick = () => {
                    nicheInput.value = match;
                    nicheHistory.style.display = 'none';
                };
                nicheHistory.appendChild(el);
            });
            nicheHistory.style.display = 'block';
        });
        
        nicheInput.addEventListener('focus', () => {
            if (nicheInput.value.trim() === '') {
                // Show popular categories by default
                nicheHistory.innerHTML = '';
                popularNiches.slice(0, 10).forEach(match => {
                    const el = document.createElement('div');
                    el.className = 'history-item';
                    el.innerHTML = `
                        <span class="item-text">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px; color: var(--accent);"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
                            ${match}
                        </span>
                        <span class="loc">Popular</span>
                    `;
                    el.onclick = () => {
                        nicheInput.value = match;
                        nicheHistory.style.display = 'none';
                    };
                    nicheHistory.appendChild(el);
                });
                nicheHistory.style.display = 'block';
            }
        });
        
        nicheInput.addEventListener('blur', () => {
            setTimeout(() => { nicheHistory.style.display = 'none'; }, 250);
        });
        
    } catch (err) {
        console.error("Niche autocomplete loading error:", err);
    }
}Configuration
// 5. Setup Search History dropdowns
async function setupHistoryDropdowns() {
    const locInput = document.getElementById('location-input');
    const locDrop = document.getElementById('location-history');
    
    try {
        const res = await fetch('/api/history');
        const history = await res.json();
        
        if (history.length === 0) return;
        
        const uniqueLocs = [...new Set(history.map(h => h.location))];
        
        locInput.addEventListener('focus', () => {
            locDrop.innerHTML = '';
            if (uniqueLocs.length > 0) {
                uniqueLocs.slice(0, 6).forEach(loc => {
                    const el = document.createElement('div');
                    el.className = 'history-item';
                    el.innerHTML = `
                        <span class="item-text">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px; color: var(--accent);"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                            ${loc}
                        </span>
                        <span class="loc">Recent</span>
                    `;
                    el.onclick = () => {
                        locInput.value = loc;
                        locDrop.style.display = 'none';
                    };
                    locDrop.appendChild(el);
                });
                locDrop.style.display = 'block';
            }
        });
        
        locInput.addEventListener('blur', () => {
            setTimeout(() => { locDrop.style.display = 'none'; }, 250);
        });
        
    } catch (err) {
        console.error("History loading error:", err);
    }
}

// 6. Fetch all database records
async function fetchLeads() {
    const filterNiche = document.getElementById('filter-niche').value;
    const filterScore = document.getElementById('filter-score').value;
    const filterSalesStatus = document.getElementById('filter-sales-status').value;
    const filterHasWeb = document.getElementById('filter-has-web').value;
    const searchVal = document.getElementById('db-search').value;
    
    let queryParams = new URLSearchParams();
    if (filterNiche) queryParams.append('niche', filterNiche);
    if (filterScore) queryParams.append('min_score', filterScore);
    if (filterSalesStatus) queryParams.append('sales_status', filterSalesStatus);
    if (filterHasWeb) queryParams.append('has_website', filterHasWeb);
    if (searchVal) queryParams.append('search_term', searchVal);
    
    queryParams.append('sort_by', currentSortColumn);
    queryParams.append('sort_order', currentSortOrder);
    
    try {
        const res = await fetch(`/api/leads?${queryParams.toString()}`);
        const data = await res.json();
        
        renderDatabaseTable(data.leads);
        renderStatsBar(data.stats);
        populateNicheFilterDropdown(data.leads);
        // Draw Dynamic CRM Visual Charts Dashboard
        drawSvgCharts(data.stats, data.leads);
    } catch (err) {
        console.error("Error fetching leads list:", err);
    }
}

// 7. Render Database Stats Summary
function renderStatsBar(stats) {
    document.getElementById('stat-total').textContent = stats.total;
    document.getElementById('stat-hot').textContent = stats.hot;
    document.getElementById('stat-contacted').textContent = stats.contacted;
    document.getElementById('stat-conversion').textContent = `${stats.conversion_pct}%`;
}

// Populate niche dropdown filter
let uniqueNicheFilter = new Set();
function populateNicheFilterDropdown(leads) {
    const dropdown = document.getElementById('filter-niche');
    const selected = dropdown.value;
    
    leads.forEach(lead => {
        if (lead.niche) {
            uniqueNicheFilter.add(lead.niche.trim().capitalize());
        }
    });
    
    dropdown.innerHTML = '<option value="">All Niches</option>';
    uniqueNicheFilter.forEach(niche => {
        const opt = document.createElement('option');
        opt.value = niche.toLowerCase();
        opt.textContent = niche;
        if (niche.toLowerCase() === selected.toLowerCase()) {
            opt.selected = true;
        }
        dropdown.appendChild(opt);
    });
}

// Render SQLite DB Leads Table Rows
window.dbLeadsCache = {};

function getPipelineColor(status) {
    switch(status) {
        case 'New': return 'var(--accent)';
        case 'Pitch Sent': return 'var(--thinking)';
        case 'Replied': return '#38BDF8';
        case 'Meeting Booked': return 'var(--warning)';
        case 'Closed Won': return 'var(--success)';
        case 'Not Interested': return 'var(--text-muted)';
        default: return 'var(--text)';
    }
}

function getPipelineBorderColor(status) {
    switch(status) {
        case 'New': return 'rgba(0, 212, 255, 0.3)';
        case 'Pitch Sent': return 'rgba(168, 85, 247, 0.3)';
        case 'Replied': return 'rgba(0, 102, 255, 0.3)';
        case 'Meeting Booked': return 'rgba(255, 184, 0, 0.3)';
        case 'Closed Won': return 'rgba(0, 255, 136, 0.3)';
        case 'Not Interested': return 'rgba(142, 159, 182, 0.3)';
        default: return 'var(--border)';
    }
}

function renderDatabaseTable(leads) {
    const tbody = document.getElementById('db-table-body');
    const zeroState = document.getElementById('db-zero-state');
    
    tbody.innerHTML = '';
    selectedLeadIds.clear();
    updateBulkActionBar();
    
    // Reset global checkbox
    document.getElementById('th-select-all').className = 'custom-checkbox';
    
    if (leads.length === 0) {
        zeroState.style.display = 'block';
        return;
    }
    
    zeroState.style.display = 'none';
    
    leads.forEach(lead => {
        // Cache lead details for instant details modals / drawers
        window.dbLeadsCache[lead.id] = lead;
        
        const tr = document.createElement('tr');
        tr.id = `row-${lead.id}`;
        
        // Score color bands
        let scoreClass = 'cold';
        if (lead.fit_score >= 8) scoreClass = 'hot';
        else if (lead.fit_score >= 5) scoreClass = 'warm';
        
        // Phone / Email / Website
        const phone = lead.phone ? `<div class="contact-tag"><i data-lucide="phone"></i><a href="tel:${lead.phone}">${lead.phone}</a></div>` : '';
        const email = lead.email ? `<div class="contact-tag"><i data-lucide="mail"></i><a href="mailto:${lead.email}">${lead.email}</a></div>` : '';
        const website = lead.website 
            ? `<div class="contact-tag"><i data-lucide="link-2"></i><a href="${lead.website}" target="_blank">${lead.website.replace(/^https?:\/\/(www\.)?/, '')}</a></div>` 
            : '';
            
        // Website Status indicator
        const webStatusClass = lead.has_website === 1 ? 'yes' : 'no';
        const webStatusText = lead.has_website === 1 ? 'Has Website' : 'No Website';
        
        // Dynamic Smart Contact routing button
        let contactBtnHtml = '';
        if (lead.phone) {
            contactBtnHtml = `
                <button class="btn-outreach-action contact-whatsapp" onclick="launchSmartContact(${lead.id})" title="Launch B2B pitch on WhatsApp to ${lead.phone}">
                    <i data-lucide="phone" size="12"></i> Contact (WhatsApp)
                </button>`;
        } else if (lead.email) {
            contactBtnHtml = `
                <button class="btn-outreach-action contact-email" onclick="launchSmartContact(${lead.id})" title="Launch prefilled B2B Email draft to ${lead.email}">
                    <i data-lucide="mail" size="12"></i> Contact (Email)
                </button>`;
        } else {
            contactBtnHtml = `
                <button class="btn-outreach-action disabled" disabled title="No phone or email available for this lead">
                    <i data-lucide="slash" size="12"></i> No Contact Info
                </button>`;
        }
        
        const pitchText = lead.pitch_message || '';
        const outreachCol = `
            <td class="outreach-cell">
                <div class="pitch-preview-text table-preview" data-id="${lead.id}" style="font-family: var(--font-data); font-size: 11px; max-width: 170px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; margin-bottom: 6px; color: var(--text-muted);" title="${pitchText.replace(/"/g, '&quot;')}">
                    ${pitchText ? pitchText.replace(/\n/g, ' ') : 'Outreach pitch not generated yet.'}
                </div>
                <div style="display: flex; gap: 6px; align-items: center;">
                    <button class="btn-outreach-action generate" id="btn-gen-${lead.id}" onclick="triggerLeadPitchGeneration(${lead.id}, this)" title="Generate outreach copy using custom template or Gemma 4">
                        <i data-lucide="cpu" size="12"></i> Generate
                    </button>
                    ${contactBtnHtml}
                    <button class="btn-action" onclick="triggerViewPitchModal(${lead.id})" title="Edit personalized outreach pitch" style="padding: 6px; height: 28px; width: 28px; justify-content: center; display: inline-flex; align-items: center;">
                        <i data-lucide="eye" size="12"></i>
                    </button>
                </div>
            </td>
        `;
        
        tr.innerHTML = `
            <td class="checkbox-cell">
                <span class="custom-checkbox" data-id="${lead.id}" onclick="toggleRowCheckbox(${lead.id})"></span>
            </td>
            <td class="business-name">
                <div>${lead.business}</div>
                <div style="font-size: 11px; color: var(--accent); margin-top: 2px; font-family: var(--font-data); font-weight: 600;">
                    ${lead.business_type || 'Local Business'}
                </div>
                <div style="margin-top: 4px;"><span class="has-web-indicator ${webStatusClass}">${webStatusText}</span></div>
            </td>
            <td class="contact-person">${lead.name || 'N/A'}</td>
            <td class="contact-info">
                ${phone}
                ${email}
                ${website}
            </td>
            <td>
                <span class="score-badge ${scoreClass}">
                    <i data-lucide="zap"></i> ${lead.fit_score}/10
                </span>
            </td>
            <td class="fit-reason">
                <div style="font-weight: 500; color: var(--text); margin-bottom: 4px;">Justification:</div>
                <div style="margin-bottom: 8px; line-height: 1.3;">${lead.reason}</div>
                <div style="font-weight: 500; color: var(--thinking); margin-bottom: 2px;">Outreach Strategy:</div>
                <div style="font-size: 11px; line-height: 1.3; font-style: italic;">${lead.outreach_tip || 'N/A'}</div>
            </td>
            <td class="notes-input-cell">
                <div class="notes-editor-container">
                    <textarea class="notes-input ${lead.notes ? 'has-content' : ''}" 
                              id="notes-input-${lead.id}" 
                              placeholder="📝 Add notes..." 
                              oninput="handleNotesInput(${lead.id}, this)"
                              onfocus="handleNotesFocus(${lead.id}, this)"
                              onblur="handleNotesBlur(${lead.id}, this)"
                              onkeydown="handleNotesKeydown(${lead.id}, event, this)"
                              data-original="${lead.notes || ''}">${lead.notes || ''}</textarea>
                    <div class="notes-status" id="notes-status-${lead.id}">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; color: var(--success);"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        <span>Saved</span>
                    </div>
                    <div class="notes-helper-badge" id="notes-helper-${lead.id}">Ctrl + Enter to Save</div>
                    ${lead.notes ? `<button class="notes-clear-btn" id="notes-clear-${lead.id}" onclick="clearLeadNotes(${lead.id})" title="Clear note">&times;</button>` : ''}
                </div>
            </td>
            <td class="followup-cell">
                <input type="date" class="followup-date-picker ${lead.follow_up_date ? 'has-date' : ''}" 
                       id="followup-${lead.id}" 
                       value="${lead.follow_up_date || ''}" 
                       onchange="updateLeadFollowup(${lead.id}, this.value)" 
                       title="Schedule follow-up date for this client">
            </td>
            <td class="crm-pipeline-cell">
                <div class="pipeline-select-wrapper">
                    <select class="pipeline-select" onchange="updateLeadSalesStatus(${lead.id}, this.value)" style="border-color: ${getPipelineBorderColor(lead.sales_status)}; color: ${getPipelineColor(lead.sales_status)}; font-weight: 700;">
                        <option value="New" ${lead.sales_status === 'New' ? 'selected' : ''}>New</option>
                        <option value="Pitch Sent" ${lead.sales_status === 'Pitch Sent' ? 'selected' : ''}>Pitch Sent</option>
                        <option value="Replied" ${lead.sales_status === 'Replied' ? 'selected' : ''}>Replied</option>
                        <option value="Meeting Booked" ${lead.sales_status === 'Meeting Booked' ? 'selected' : ''}>Meeting Booked</option>
                        <option value="Closed Won" ${lead.sales_status === 'Closed Won' ? 'selected' : ''}>Closed Won</option>
                        <option value="Not Interested" ${lead.sales_status === 'Not Interested' ? 'selected' : ''}>Not Interested</option>
                    </select>
                </div>
            </td>
            ${outreachCol}
            <td style="text-align: center;">
                <button class="btn-action danger" onclick="deleteLead(${lead.id})" title="Delete lead from SQLite">
                    <i data-lucide="trash-2" size="14"></i>
                </button>
            </td>
        `;
        
        tbody.appendChild(tr);
    });
    
    lucide.createIcons();
}

async function triggerLeadPitchGeneration(leadId, btnElement = null) {
    const btn = btnElement || document.getElementById(`btn-gen-${leadId}`) || document.getElementById(`btn-gen-card-${leadId}`);
    if (!btn) return;
    
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<svg class="spin-loader" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="animation: spin 1.5s linear infinite; margin-right: 4px;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path></svg> Compiling...`;
    
    // Read custom template from LocalStorage
    const customTemplate = localStorage.getItem('outreach_template') || '';
    
    try {
        const res = await fetch(`/api/leads/${leadId}/generate-pitch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ template: customTemplate })
        });
        
        const data = await res.json();
        
        if (data.success) {
            // Update preview and cache in-place (both table and card)
            const previews = document.querySelectorAll(`.pitch-preview-text[data-id="${leadId}"]`);
            previews.forEach(preview => {
                if (preview.classList.contains('table-preview')) {
                    preview.textContent = data.pitch_message.replace(/\n/g, ' ');
                    preview.title = data.pitch_message;
                } else {
                    preview.textContent = data.pitch_message;
                    preview.title = data.pitch_message;
                }
            });
            
            if (window.dbLeadsCache[leadId]) {
                window.dbLeadsCache[leadId].pitch_message = data.pitch_message;
            }
            
            logToConsole(`✨ Outreach pitch generated for '${window.dbLeadsCache[leadId].business}'! (${data.used_ai ? 'Used Gemma 4' : 'Used Template Compiler'})`, 'highlight');
        } else {
            alert("Outreach generation failed: " + data.error);
        }
    } catch (err) {
        console.error("Outreach generation error:", err);
        alert("Failed to generate outreach pitch.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
        lucide.createIcons();
    }
}

function launchSmartContact(leadId) {
    const lead = window.dbLeadsCache[leadId];
    if (!lead) return;
    
    if (!lead.pitch_message) {
        // Auto compile dynamically if not generated yet!
        const customTemplate = localStorage.getItem('outreach_template') || '';
        lead.pitch_message = compileTemplateLocally(customTemplate, lead);
    }
    
    if (lead.phone) {
        sendWhatsapp(lead.phone, leadId, true);
    } else if (lead.email) {
        sendEmail(lead.email, leadId, true);
    } else {
        alert("No contact details (Phone or Email) are registered for this prospect.");
    }
}

async function updateLeadFollowup(leadId, dateValue) {
    const input = document.getElementById(`followup-${leadId}`);
    if (dateValue) {
        input.classList.add('has-date');
    } else {
        input.classList.remove('has-date');
    }
    
    try {
        const res = await fetch(`/api/leads/${leadId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ follow_up_date: dateValue })
        });
        const data = await res.json();
        if (data.success) {
            logToConsole(`📅 Scheduled follow-up for '${data.lead.business}' on ${dateValue || 'Cleared'}`);
            if (window.dbLeadsCache[leadId]) {
                window.dbLeadsCache[leadId].follow_up_date = dateValue;
            }
        }
    } catch (err) {
        console.error("Follow-up date update failed:", err);
    }
}

async function updateLeadSalesStatus(leadId, statusValue) {
    const select = document.querySelector(`#row-${leadId} .pipeline-select`);
    if (select) {
        select.style.borderColor = getPipelineBorderColor(statusValue);
        select.style.color = getPipelineColor(statusValue);
    }
    
    try {
        const res = await fetch(`/api/leads/${leadId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sales_status: statusValue })
        });
        const data = await res.json();
        if (data.success) {
            logToConsole(`💼 CRM Pipeline: Updated '${data.lead.business}' stage to '${statusValue}'`, 'highlight');
            if (window.dbLeadsCache[leadId]) {
                window.dbLeadsCache[leadId].sales_status = statusValue;
                window.dbLeadsCache[leadId].contacted = data.lead.contacted;
            }
            // Refresh counts and visual charts instantly!
            fetchLeads();
        }
    } catch (err) {
        console.error("Sales status update failed:", err);
    }
}

// Local template compiler helper for instant launches if pitch is empty
function compileTemplateLocally(templateStr, lead) {
    if (!templateStr) {
        // Fallback default B2B pitch
        const name = lead.name && lead.name !== 'N/A' ? lead.name : 'prospect';
        const salutation = lead.name && lead.name !== 'N/A' ? `Hi ${lead.name}` : `Hi team at ${lead.business}`;
        return `${salutation},\n\nMy name is Nil, a full-stack developer. I found ${lead.business} and wanted to pitch automation. ${lead.outreach_tip}\n\nBest regards,\nNil Patel`;
    }
    
    let compiled = templateStr;
    compiled = compiled.replace(/{name}/g, lead.name && lead.name !== 'N/A' ? lead.name : 'prospect');
    compiled = compiled.replace(/{business}/g, lead.business || 'N/A');
    compiled = compiled.replace(/{niche}/g, lead.niche ? lead.niche.toLowerCase() : 'N/A');
    compiled = compiled.replace(/{outreach_tip}/g, lead.outreach_tip || 'N/A');
    compiled = compiled.replace(/{website}/g, lead.website || 'N/A');
    compiled = compiled.replace(/{address}/g, lead.address || 'N/A');
    compiled = compiled.replace(/{fit_score}/g, lead.fit_score || '5');
    
    return compiled;
}


// 8. Row selection checkboxes
function toggleRowCheckbox(leadId) {
    const cb = document.querySelector(`.checkbox-cell .custom-checkbox[data-id="${leadId}"]`);
    if (selectedLeadIds.has(leadId)) {
        selectedLeadIds.delete(leadId);
        cb.classList.remove('checked');
    } else {
        selectedLeadIds.add(leadId);
        cb.classList.add('checked');
    }
    
    updateBulkActionBar();
}

function toggleAllRows() {
    const masterCb = document.getElementById('th-select-all');
    const allCbs = document.querySelectorAll('.checkbox-cell .custom-checkbox');
    
    const checking = !masterCb.classList.contains('checked');
    
    if (checking) {
        masterCb.classList.add('checked');
        allCbs.forEach(cb => {
            const id = parseInt(cb.getAttribute('data-id'));
            selectedLeadIds.add(id);
            cb.classList.add('checked');
        });
    } else {
        masterCb.classList.remove('checked');
        allCbs.forEach(cb => {
            const id = parseInt(cb.getAttribute('data-id'));
            selectedLeadIds.delete(id);
            cb.classList.remove('checked');
        });
    }
    
    updateBulkActionBar();
}

function updateBulkActionBar() {
    const bar = document.getElementById('bulk-action-bar');
    const countSpan = document.getElementById('checked-count');
    
    if (selectedLeadIds.size > 0) {
        bar.style.display = 'flex';
        countSpan.textContent = selectedLeadIds.size;
    } else {
        bar.style.display = 'none';
    }
}

// Bulk delete checked items
async function executeBulkDelete() {
    if (!confirm(`Are you sure you want to delete all ${selectedLeadIds.size} checked leads?`)) return;
    
    let deletedCount = 0;
    for (let id of selectedLeadIds) {
        try {
            const res = await fetch(`/api/leads/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) deletedCount++;
        } catch (err) {
            console.error("Bulk delete item error:", err);
        }
    }
    
    alert(`Successfully deleted ${deletedCount} leads.`);
    fetchLeads();
}

// Inline Notes updates
async function updateLeadNotes(leadId, notesValue) {
    const status = document.getElementById(`notes-status-${leadId}`);
    if (status) {
        status.style.opacity = '1';
        status.style.transform = 'translateY(0)';
        status.querySelector('span').textContent = 'Saving...';
    }
    
    try {
        const res = await fetch(`/api/leads/${leadId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: notesValue })
        });
        const data = await res.json();
        if (data.success) {
            if (status) {
                status.querySelector('span').textContent = 'Saved';
                setTimeout(() => {
                    status.style.opacity = '0';
                    status.style.transform = 'translateY(4px)';
                }, 1500);
            }
        }
    } catch (err) {
        console.error("Error saving lead notes:", err);
        if (status) {
            status.querySelector('span').textContent = 'Failed';
            status.style.color = 'var(--danger)';
        }
    }
}

// Toggle contacted status via PATCH
async function toggleContacted(leadId) {
    const btn = document.querySelector(`#row-${leadId} .toggle-contacted`);
    const isContacted = btn.classList.contains('yes');
    const newStatus = isContacted ? 0 : 1;
    
    try {
        const res = await fetch(`/api/leads/${leadId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contacted: newStatus })
        });
        const data = await res.json();
        
        if (data.success) {
            fetchLeads(); // refresh to update stats conversion% and lists
        }
    } catch (err) {
        console.error("Error patching contacted status:", err);
    }
}

// Delete Lead from SQLite
async function deleteLead(leadId) {
    if (!confirm("Are you sure you want to permanently delete this lead?")) return;
    
    try {
        const res = await fetch(`/api/leads/${leadId}`, { method: 'DELETE' });
        const data = await res.json();
        
        if (data.success) {
            const row = document.getElementById(`row-${leadId}`);
            row.style.animation = 'slide-down-anim 0.3s reverse';
            setTimeout(() => {
                row.remove();
                fetchLeads();
            }, 300);
        }
    } catch (err) {
        console.error("Error deleting lead:", err);
    }
}

// Sort column values
function sortDbTable(column) {
    if (currentSortColumn === column) {
        currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortColumn = column;
        currentSortOrder = 'desc';
    }
    
    const indicators = ['business', 'name', 'fit_score', 'contacted'];
    indicators.forEach(ind => {
        const span = document.getElementById(`sort-${ind}`);
        if (!span) return;
        if (ind === column) {
            span.textContent = currentSortOrder === 'asc' ? '▲' : '▼';
            span.style.opacity = '1';
            span.style.color = 'var(--accent)';
        } else {
            span.textContent = '⇅';
            span.style.opacity = '0.5';
            span.style.color = 'inherit';
        }
    });
    
    fetchLeads();
}

// Trigger Excel CSV Download
async function exportDatabaseToCsv() {
    try {
        const response = await fetch('/api/leads/export', { method: 'POST' });
        const blob = await response.blob();
        
        const disposition = response.headers.get('Content-Disposition');
        let filename = `nilleads_export_${new Date().toISOString().slice(0,10)}.csv`;
        
        if (disposition && disposition.indexOf('attachment') !== -1) {
            const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
            const matches = filenameRegex.exec(disposition);
            if (matches != null && matches[1]) { 
                filename = matches[1].replace(/['"]/g, '');
            }
        }
        
        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (err) {
        console.error("Error exporting database:", err);
        alert("Failed to export database.");
    }
}

// Ticker console logger
function logToConsole(message, type = 'info') {
    const box = document.getElementById('console-box');
    const line = document.createElement('div');
    line.className = 'console-line';
    
    const timestamp = new Date().toTimeString().split(' ')[0];
    
    let textClass = 'console-text';
    if (type === 'highlight') textClass = 'console-text highlight';
    else if (type === 'warning') textClass = 'console-text warning';
    else if (type === 'error') textClass = 'console-text error';
    
    line.innerHTML = `
        <span class="console-time">[${timestamp}]</span>
        <span class="${textClass}">${message}</span>
    `;
    
    box.appendChild(line);
    box.scrollTop = box.scrollHeight;
}

// Update Context Usage Bar
function updateContextBar(tokens) {
    const barInner = document.getElementById('context-bar-inner');
    const label = document.getElementById('context-tokens-used');
    
    const limit = 131072; // 128K
    const percent = Math.min((tokens / limit) * 100, 100);
    
    barInner.style.width = `${percent}%`;
    label.textContent = tokens.toLocaleString();
    
    if (percent > 85) {
        barInner.className = 'context-bar-inner warning';
    } else {
        barInner.className = 'context-bar-inner';
    }
}

// Trigger SSE scan
function triggerLeadScan() {
    const niche = document.getElementById('niche-input').value.trim();
    const location = document.getElementById('location-input').value.trim();
    const customUrl = document.getElementById('custom-url-input').value.trim();
    
    // Read multi-select source checkboxes
    const enabledSources = [];
    if (document.getElementById('src-google') && document.getElementById('src-google').checked) enabledSources.push('google');
    if (document.getElementById('src-justdial') && document.getElementById('src-justdial').checked) enabledSources.push('justdial');
    if (document.getElementById('src-indiamart') && document.getElementById('src-indiamart').checked) enabledSources.push('indiamart');
    if (document.getElementById('src-custom') && document.getElementById('src-custom').checked) enabledSources.push('custom');
    
    if (enabledSources.length === 0) {
        alert("Please select at least one search source directory.");
        return;
    }
    
    const btnSubmit = document.getElementById('btn-submit');
    const submitIcon = document.getElementById('submit-icon');
    const submitText = document.getElementById('submit-text');
    const livePanel = document.getElementById('live-panel');
    const liveContainer = document.getElementById('live-cards-container');
    const consoleBox = document.getElementById('console-box');
    
    const isCustomOnly = enabledSources.length === 1 && enabledSources[0] === 'custom';
    if (!niche && !isCustomOnly) {
        alert("Please enter a target niche.");
        return;
    }
    
    // UI Resets
    livePanel.style.display = 'block';
    liveContainer.innerHTML = '';
    consoleBox.innerHTML = '';
    updateContextBar(0);
    
    btnSubmit.disabled = true;
    submitIcon.setAttribute('data-lucide', 'loader-2');
    submitIcon.style.animation = 'spin 1.5s linear infinite';
    submitText.textContent = "Scanning...";
    lucide.createIcons();
    
    logToConsole("🚀 NilLeads lead scan process running...");
    logToConsole(`📂 Crawling sources together: ${enabledSources.map(s => s.toUpperCase()).join(' + ')}`);
    if (isThinkingMode) {
        logToConsole("🧠 Gemma 4 Deconstructive Thinking mode active. Scan will be slower but highly descriptive.", "warning");
    }
    
    const body = {
        niche,
        location,
        sources: enabledSources,
        custom_url: customUrl,
        thinking: isThinkingMode
    };
    
    // Connect to Search SSE Stream
    fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }).then(response => {
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        
        function readChunk() {
            return reader.read().then(({ done, value }) => {
                if (done) {
                    resetSubmitButton();
                    return;
                }
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                
                // Keep the last partial line in the buffer
                buffer = lines.pop();
                
                lines.forEach(line => {
                    if (line.startsWith('data: ')) {
                        try {
                            const eventData = JSON.parse(line.substring(6));
                            handleSseEvent(eventData);
                        } catch (e) {
                            // bypass json parse fragments
                        }
                    }
                });
                
                return readChunk();
            });
        }
        
        return readChunk();
    }).catch(err => {
        logToConsole(`❌ SSE stream connection error: ${err.message}`, 'error');
        resetSubmitButton();
    });
}

// Parse SSE search events
function handleSseEvent(event) {
    const liveContainer = document.getElementById('live-cards-container');
    
    if (event.tokens) {
        updateContextBar(event.tokens);
    }
    
    if (event.status === 'progress') {
        logToConsole(event.message);
    } else if (event.status === 'warning') {
        logToConsole(event.message, 'warning');
    } else if (event.status === 'error') {
        logToConsole(event.message, 'error');
        resetSubmitButton();
    } else if (event.status === 'lead') {
        const lead = event.data;
        logToConsole(`🌟 AI Extracted lead prospect: '${lead.business}'!`, 'highlight');
        
        // Cache lead details immediately so outreach generation and dynamic smart contact work in the live feed!
        window.dbLeadsCache[lead.id] = lead;
        
        // Build card
        const card = document.createElement('div');
        card.className = 'lead-card';
        card.id = `live-card-${lead.id}`;
        
        let scoreClass = 'cold';
        if (lead.fit_score >= 8) scoreClass = 'hot';
        else if (lead.fit_score >= 5) scoreClass = 'warm';
        
        const webStatusClass = lead.has_website === 1 ? 'yes' : 'no';
        const webStatusText = lead.has_website === 1 ? 'Has Website' : 'No Website';
        
        const phone = lead.phone ? `<div class="card-info-item"><i data-lucide="phone"></i><a href="tel:${lead.phone}">${lead.phone}</a></div>` : '';
        const email = lead.email ? `<div class="card-info-item"><i data-lucide="mail"></i><a href="mailto:${lead.email}">${lead.email}</a></div>` : '';
        const website = lead.website 
            ? `<div class="card-info-item"><i data-lucide="link-2"></i><a href="${lead.website}" target="_blank">${lead.website.replace(/^https?:\/\/(www\.)?/, '')}</a></div>` 
            : '';
        const address = lead.address ? `<div class="card-info-item"><i data-lucide="map-pin"></i><span>${lead.address}</span></div>` : '';
        
        // Dynamic Smart Contact routing button
        let contactBtnHtml = '';
        if (lead.phone) {
            contactBtnHtml = `
                <button class="btn-outreach-action contact-whatsapp" onclick="launchSmartContact(${lead.id})" title="Launch B2B pitch on WhatsApp to ${lead.phone}">
                    <i data-lucide="phone" size="12"></i> Contact (WhatsApp)
                </button>`;
        } else if (lead.email) {
            contactBtnHtml = `
                <button class="btn-outreach-action contact-email" onclick="launchSmartContact(${lead.id})" title="Launch prefilled B2B Email draft to ${lead.email}">
                    <i data-lucide="mail" size="12"></i> Contact (Email)
                </button>`;
        } else {
            contactBtnHtml = `
                <button class="btn-outreach-action disabled" disabled title="No phone or email available for this lead">
                    <i data-lucide="slash" size="12"></i> No Contact Info
                </button>`;
        }
        
        const pitchText = lead.pitch_message || '';
        
        card.innerHTML = `
            ${isThinkingMode ? `<div class="thinking-indicator-pulse"><i data-lucide="brain"></i><span>Gemma reasoning active</span></div>` : ''}
            <div class="card-top">
                <div class="card-title">
                    <h3>${lead.business}</h3>
                    <div style="font-size: 11px; color: var(--accent); font-family: var(--font-data); margin-bottom: 4px; font-weight: 600;">
                        ${lead.business_type || 'Local Business'}
                    </div>
                    <p><i data-lucide="user"></i> ${lead.name || 'N/A'}</p>
                </div>
                <span class="score-badge ${scoreClass}">
                    <i data-lucide="zap"></i> ${lead.fit_score}/10
                </span>
            </div>
            <div class="card-body">
                ${phone}
                ${email}
                ${website}
                ${address}
                <div style="margin-top: 6px;"><span class="has-web-indicator ${webStatusClass}">${webStatusText}</span></div>
                
                <div class="card-text-block reason">
                    <div class="card-text-block-title"><i data-lucide="file-text" size="10"></i> AI Fit Reason</div>
                    ${lead.reason}
                </div>
                
                <div class="card-text-block outreach">
                    <div class="card-text-block-title" style="color: var(--thinking);"><i data-lucide="compass" size="10"></i> Outreach Pitch Tip</div>
                    ${lead.outreach_tip || 'N/A'}
                </div>
                
                <div class="card-text-block pitch-preview-box" style="margin-top: 12px; border-top: 1px solid rgba(255, 255, 255, 0.05); padding-top: 12px;">
                    <div class="card-text-block-title" style="color: var(--success); display: flex; justify-content: space-between; align-items: center;">
                        <span><i data-lucide="mail-open" size="10"></i> Cold Pitch Message</span>
                        <button class="btn-action" onclick="triggerViewPitchModal(${lead.id})" title="Edit personalized outreach pitch" style="padding: 2px; height: 18px; width: 18px; justify-content: center; display: inline-flex; align-items: center; border: none; background: none; color: var(--text-muted); cursor: pointer;">
                            <i data-lucide="eye" size="10"></i>
                        </button>
                    </div>
                    <div class="pitch-preview-text card-preview" data-id="${lead.id}" style="font-family: var(--font-data); font-size: 11px; margin-top: 6px; max-height: 72px; overflow-y: auto; white-space: pre-wrap; color: var(--text-muted); padding: 6px; background: rgba(0, 0, 0, 0.2); border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.02);">
                        ${pitchText || 'Outreach pitch not generated yet.'}
                    </div>
                </div>
            </div>
            <div class="card-footer" style="display: flex; flex-direction: column; gap: 12px; border-top: 1px solid rgba(255, 255, 255, 0.05); padding-top: 16px; margin-top: auto;">
                <div style="display: flex; gap: 8px; width: 100%; flex-wrap: wrap;">
                    <button class="btn-outreach-action generate" id="btn-gen-card-${lead.id}" onclick="triggerLeadPitchGeneration(${lead.id}, this)" title="Generate outreach copy using custom template or Gemma 4" style="flex: 1; min-width: 100px;">
                        <i data-lucide="cpu" size="12"></i> Generate Pitch
                    </button>
                    <div style="flex: 1.2; min-width: 130px; display: flex;">
                        ${contactBtnHtml.replace('class="btn-outreach-action', 'class="btn-outreach-action" style="width: 100%;"')}
                    </div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-top: 4px;">
                    <span class="niche-tag">${lead.niche}</span>
                    <button class="btn-save-lead saved" disabled style="padding: 4px 10px; font-size: 11px;">
                        <i data-lucide="check" size="12"></i> Saved to CRM
                    </button>
                </div>
            </div>
        `;
        
        liveContainer.appendChild(card);
        lucide.createIcons();
        
        // Sync database table in background
        fetchLeads();
    } else if (event.status === 'complete') {
        logToConsole(event.message, 'highlight');
        resetSubmitButton();
        fetchLeads();
    }
}

// Reset submit button state
function resetSubmitButton() {
    const btnSubmit = document.getElementById('btn-submit');
    const submitIcon = document.getElementById('submit-icon');
    const submitText = document.getElementById('submit-text');
    
    btnSubmit.disabled = false;
    submitIcon.setAttribute('data-lucide', 'cpu');
    submitIcon.style.animation = 'none';
    submitText.textContent = "Find Leads";
    lucide.createIcons();
    
    setupHistoryDropdowns();
}

// Helper capitalize string
String.prototype.capitalize = function() {
    return this.replace(/(^\w|\s\w)/g, m => m.toUpperCase());
}

// Inline Notes UX Pro Max Handlers
function handleNotesInput(leadId, textarea) {
    // 1. Auto-resize textarea height
    textarea.style.height = '40px';
    const scrollHeight = textarea.scrollHeight;
    textarea.style.height = (scrollHeight > 40 ? Math.min(scrollHeight, 150) : 40) + 'px';
    
    // Update content class
    if (textarea.value.trim()) {
        textarea.classList.add('has-content');
        // Show clear button if not already present
        let clearBtn = document.getElementById(`notes-clear-${leadId}`);
        if (!clearBtn) {
            clearBtn = document.createElement('button');
            clearBtn.className = 'notes-clear-btn';
            clearBtn.id = `notes-clear-${leadId}`;
            clearBtn.innerHTML = '&times;';
            clearBtn.title = 'Clear note';
            clearBtn.onclick = (e) => {
                e.stopPropagation();
                clearLeadNotes(leadId);
            };
            textarea.parentNode.appendChild(clearBtn);
        }
    } else {
        textarea.classList.remove('has-content');
        const clearBtn = document.getElementById(`notes-clear-${leadId}`);
        if (clearBtn) clearBtn.remove();
    }
    
    // 2. Debounced auto-save (800ms)
    if (notesDebounceTimers[leadId]) {
        clearTimeout(notesDebounceTimers[leadId]);
    }
    
    const helper = document.getElementById(`notes-helper-${leadId}`);
    if (helper) {
        helper.textContent = 'Saving...';
        helper.className = 'notes-helper-badge visible saving';
    }
    
    notesDebounceTimers[leadId] = setTimeout(() => {
        saveLeadNotesSilent(leadId, textarea.value);
    }, 800);
}

function handleNotesFocus(leadId, textarea) {
    textarea.setAttribute('data-original', textarea.value);
    
    // Auto grow on focus
    textarea.style.height = '40px';
    const scrollHeight = textarea.scrollHeight;
    textarea.style.height = (scrollHeight > 40 ? Math.min(scrollHeight, 150) : 40) + 'px';
    
    const helper = document.getElementById(`notes-helper-${leadId}`);
    if (helper) {
        helper.textContent = 'Ctrl + Enter to Save';
        helper.className = 'notes-helper-badge visible';
    }
}

function handleNotesBlur(leadId, textarea) {
    const helper = document.getElementById(`notes-helper-${leadId}`);
    if (helper) {
        helper.classList.remove('visible');
        helper.classList.remove('saving');
    }
    
    // Save on blur if content changed
    const original = textarea.getAttribute('data-original');
    if (textarea.value !== original) {
        if (notesDebounceTimers[leadId]) {
            clearTimeout(notesDebounceTimers[leadId]);
        }
        updateLeadNotes(leadId, textarea.value);
    }
    
    // Shrink slightly for table safety after a brief delay
    setTimeout(() => {
        if (!textarea.value.trim()) {
            textarea.style.height = '40px';
            textarea.classList.remove('has-content');
            const clearBtn = document.getElementById(`notes-clear-${leadId}`);
            if (clearBtn) clearBtn.remove();
        } else {
            textarea.style.height = '40px'; // Keep compact when blurred
        }
    }, 200);
}

function handleNotesKeydown(leadId, event, textarea) {
    // Ctrl + Enter -> Save and Blur
    if (event.ctrlKey && event.key === 'Enter') {
        event.preventDefault();
        textarea.blur();
    }
    // Escape -> Revert and Blur
    if (event.key === 'Escape') {
        event.preventDefault();
        const original = textarea.getAttribute('data-original');
        textarea.value = original;
        if (notesDebounceTimers[leadId]) {
            clearTimeout(notesDebounceTimers[leadId]);
        }
        textarea.style.height = '40px';
        textarea.blur();
    }
}

async function saveLeadNotesSilent(leadId, notesValue) {
    const helper = document.getElementById(`notes-helper-${leadId}`);
    try {
        const res = await fetch(`/api/leads/${leadId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: notesValue })
        });
        const data = await res.json();
        if (data.success) {
            const textarea = document.getElementById(`notes-input-${leadId}`);
            if (textarea) textarea.setAttribute('data-original', notesValue);
            
            if (helper) {
                helper.textContent = 'Saved ✔';
                helper.className = 'notes-helper-badge visible saved';
                setTimeout(() => {
                    if (helper.classList.contains('saved')) {
                        helper.classList.remove('saved');
                        if (document.activeElement === textarea) {
                            helper.textContent = 'Ctrl + Enter to Save';
                        } else {
                            helper.classList.remove('visible');
                        }
                    }
                }, 1200);
            }
        }
    } catch (err) {
        console.error("Silent save error:", err);
        if (helper) {
            helper.textContent = 'Failed!';
            helper.className = 'notes-helper-badge visible error';
        }
    }
}

async function clearLeadNotes(leadId) {
    if (!confirm("Are you sure you want to clear this note?")) return;
    
    const textarea = document.getElementById(`notes-input-${leadId}`);
    if (textarea) {
        textarea.value = '';
        textarea.classList.remove('has-content');
        textarea.style.height = '40px';
        textarea.setAttribute('data-original', '');
    }
    
    const clearBtn = document.getElementById(`notes-clear-${leadId}`);
    if (clearBtn) clearBtn.remove();
    
    if (notesDebounceTimers[leadId]) {
        clearTimeout(notesDebounceTimers[leadId]);
    }
    
    updateLeadNotes(leadId, '');
}

// 10. Theme Switcher Logic
function toggleTheme() {
    const currentTheme = document.body.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    if (newTheme === 'light') {
        document.body.setAttribute('data-theme', 'light');
    } else {
        document.body.removeAttribute('data-theme');
    }
    
    localStorage.setItem('theme', newTheme);
    updateThemeUI(newTheme);
}

function updateThemeUI(theme) {
    const btn = document.getElementById('theme-toggle');
    const icon = document.getElementById('theme-icon');
    const text = document.getElementById('theme-text');
    
    if (!btn || !icon || !text) return;
    
    if (theme === 'light') {
        icon.setAttribute('data-lucide', 'sun');
        text.textContent = 'Light Mode';
        btn.title = 'Switch to Dark Mode';
    } else {
        icon.setAttribute('data-lucide', 'moon');
        text.textContent = 'Dark Mode';
        btn.title = 'Switch to Light Widescreen Mode';
    }
    
    // Re-initialize Lucide icons to swap sun/moon
    lucide.createIcons();
}

// 11. Outreach Pitch Modal and Quick Actions Driver Functions
let activeModalLead = null;

function triggerViewPitchModal(leadId) {
    const lead = window.dbLeadsCache[leadId];
    if (!lead) return;
    
    activeModalLead = lead;
    
    const modal = document.getElementById('pitch-modal');
    const textarea = document.getElementById('pitch-modal-textarea');
    const channelInfo = document.getElementById('modal-channel-info');
    const waBtn = document.getElementById('btn-modal-whatsapp');
    const emailBtn = document.getElementById('btn-modal-email');
    
    textarea.value = lead.pitch_message || '';
    channelInfo.innerHTML = `
        <strong>Niche:</strong> ${lead.niche} | <strong>Business:</strong> ${lead.business}
    `;
    
    // Display WhatsApp button if phone exists
    if (lead.phone) {
        waBtn.style.display = 'flex';
        waBtn.setAttribute('title', `Send via WhatsApp to ${lead.phone}`);
    } else {
        waBtn.style.display = 'none';
    }
    
    // Display Email button if email exists
    if (lead.email) {
        emailBtn.style.display = 'flex';
        emailBtn.setAttribute('title', `Send via Email to ${lead.email}`);
    } else {
        emailBtn.style.display = 'none';
    }
    
    modal.style.display = 'flex';
    lucide.createIcons();
}

function closePitchModal() {
    document.getElementById('pitch-modal').style.display = 'none';
    activeModalLead = null;
}

function copyPitchFromModal() {
    const textarea = document.getElementById('pitch-modal-textarea');
    textarea.select();
    navigator.clipboard.writeText(textarea.value).then(() => {
        const btn = document.getElementById('btn-modal-copy');
        const originalText = btn.innerHTML;
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 6px;"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
        btn.classList.add('success');
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.classList.remove('success');
        }, 1500);
    }).catch(err => {
        alert("Failed to copy outreach pitch to clipboard.");
    });
}

function sendWhatsappFromModal() {
    if (!activeModalLead) return;
    const textarea = document.getElementById('pitch-modal-textarea');
    const text = encodeURIComponent(textarea.value);
    const cleanedPhone = activeModalLead.phone.replace(/[^\d+]/g, '');
    window.open(`https://wa.me/${cleanedPhone}?text=${text}`, '_blank');
}

function sendEmailFromModal() {
    if (!activeModalLead) return;
    const textarea = document.getElementById('pitch-modal-textarea');
    const body = encodeURIComponent(textarea.value);
    const subject = encodeURIComponent(`Outreach Partnership with ${activeModalLead.business}`);
    window.open(`mailto:${activeModalLead.email}?subject=${subject}&body=${body}`, '_blank');
}

function copyPitchText(leadId, isDb = false) {
    let text = '';
    if (isDb) {
        text = window.dbLeadsCache[leadId] ? window.dbLeadsCache[leadId].pitch_message : '';
    } else {
        const el = document.getElementById(`pitch-box-${leadId}`);
        if (el) text = el.innerText;
    }
    
    if (!text) {
        alert("No outreach pitch message generated for this lead.");
        return;
    }
    
    navigator.clipboard.writeText(text).then(() => {
        alert("Personalized cold outreach pitch copied to clipboard!");
    }).catch(err => {
        console.error("Clipboard copy failed:", err);
        alert("Failed to copy outreach pitch.");
    });
}

function sendWhatsapp(phone, leadId, isDb = false) {
    let text = '';
    if (isDb) {
        text = window.dbLeadsCache[leadId] ? window.dbLeadsCache[leadId].pitch_message : '';
    } else {
        const el = document.getElementById(`pitch-box-${leadId}`);
        if (el) text = el.innerText;
    }
    const cleanedPhone = phone.replace(/[^\d+]/g, '');
    window.open(`https://wa.me/${cleanedPhone}?text=${encodeURIComponent(text)}`, '_blank');
}

function sendEmail(email, leadId, isDb = false) {
    let text = '';
    let bizName = '';
    if (isDb) {
        const lead = window.dbLeadsCache[leadId];
        text = lead ? lead.pitch_message : '';
        bizName = lead ? lead.business : '';
    } else {
        const el = document.getElementById(`pitch-box-${leadId}`);
        if (el) text = el.innerText;
        const card = document.getElementById(`live-card-${leadId}`);
        if (card) {
            const h3 = card.querySelector('.card-title h3');
            if (h3) bizName = h3.innerText;
        }
    }
    const subject = encodeURIComponent(`Outreach Partnership with ${bizName}`);
    window.open(`mailto:${email}?subject=${subject}&body=${encodeURIComponent(text)}`, '_blank');
}

// Collapsible Analytics panel state management
function toggleAnalyticsDashboard() {
    const content = document.getElementById('analytics-content');
    const chevron = document.getElementById('analytics-chevron');
    if (!content || !chevron) return;
    
    const isCollapsed = content.style.maxHeight === '0px';
    if (isCollapsed) {
        content.style.maxHeight = '1000px';
        chevron.setAttribute('data-lucide', 'chevron-up');
        localStorage.setItem('analytics_collapsed', 'false');
    } else {
        content.style.maxHeight = '0px';
        chevron.setAttribute('data-lucide', 'chevron-down');
        localStorage.setItem('analytics_collapsed', 'true');
    }
    lucide.createIcons();
}

// Open / Close Template customizer
function openTemplateCustomizer() {
    const modal = document.getElementById('template-modal');
    const textarea = document.getElementById('outreach-template-textarea');
    if (!modal || !textarea) return;
    
    // Load custom template from localStorage, fallback to default
    const saved = localStorage.getItem('outreach_template') || getDefaultB2bTemplate();
    textarea.value = saved;
    
    modal.style.display = 'flex';
    lucide.createIcons();
}

function closeTemplateCustomizer() {
    const modal = document.getElementById('template-modal');
    if (modal) modal.style.display = 'none';
}

function insertTemplateTag(tag) {
    const textarea = document.getElementById('outreach-template-textarea');
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    
    textarea.value = text.substring(0, start) + tag + text.substring(end);
    textarea.focus();
    textarea.selectionStart = start + tag.length;
    textarea.selectionEnd = start + tag.length;
}

function saveCustomTemplate() {
    const textarea = document.getElementById('outreach-template-textarea');
    if (!textarea) return;
    
    localStorage.setItem('outreach_template', textarea.value);
    logToConsole("💾 Outreach template configurations saved locally!", "highlight");
    closeTemplateCustomizer();
}

function resetDefaultTemplate() {
    if (!confirm("Are you sure you want to reset to the default high-ticket B2B outreach template?")) return;
    const textarea = document.getElementById('outreach-template-textarea');
    if (textarea) textarea.value = getDefaultB2bTemplate();
}

function getDefaultB2bTemplate() {
    return `Hi {name},\n\nMy name is Nil, a full-stack developer specializing in digital automation for {niche} businesses.\n\nI was auditing local prospects and found {business}. {outreach_tip}\n\nI've already prepared a working custom prototype tailored to your setup. Would you be open to a quick 5-minute call or chat this week to see it?\n\nBest regards,\nNil Patel`;
}

// Bulk sales status updater
async function executeBulkStatusUpdate() {
    const select = document.getElementById('bulk-status-select');
    if (!select || selectedLeadIds.size === 0) return;
    
    const targetStatus = select.value;
    if (!confirm(`Are you sure you want to update the CRM sales stage to '${targetStatus}' for all ${selectedLeadIds.size} checked leads?`)) return;
    
    const btn = document.querySelector('.bulk-action-bar button.success');
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<svg class="spin-loader" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="animation: spin 1.5s linear infinite; margin-right: 4px;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path></svg> Applying...`;
    
    try {
        const res = await fetch('/api/leads/bulk-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lead_ids: Array.from(selectedLeadIds),
                sales_status: targetStatus
            })
        });
        
        const data = await res.json();
        if (data.success) {
            logToConsole(`💼 CRM Bulk Update: Successfully transitioned ${data.count} leads to stage '${targetStatus}'!`, 'highlight');
            fetchLeads(); // refresh stats and charts
        } else {
            alert("Bulk update failed: " + data.error);
        }
    } catch (err) {
        console.error("Bulk status update failed:", err);
        alert("Failed to run bulk pipeline update.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
        lucide.createIcons();
    }
}

// SVG Dynamic Visual Charting Engine
function drawSvgCharts(stats, leads) {
    drawFunnelChart(stats);
    drawNicheDonutChart(leads);
    drawFitScoreBarChart(stats);
}

function drawFunnelChart(stats) {
    const container = document.getElementById('funnel-chart-container');
    if (!container) return;
    
    const stages = [
        { label: 'New', count: stats.new || 0, color: 'var(--accent)' },
        { label: 'Pitch Sent', count: stats.pitch_sent || 0, color: 'var(--thinking)' },
        { label: 'Replied', count: stats.replied || 0, color: '#38BDF8' },
        { label: 'Booked', count: stats.booked || 0, color: 'var(--warning)' },
        { label: 'Closed Won', count: stats.closed || 0, color: 'var(--success)' }
    ];
    
    const maxVal = Math.max(...stages.map(s => s.count), 1);
    
    let svgHtml = `<svg width="100%" height="100%" viewBox="0 0 300 180" style="overflow: visible;">`;
    
    // Draw stacked trapezoids representing pipeline funnel
    const totalStages = stages.length;
    const stageHeight = 26;
    const gap = 6;
    
    stages.forEach((stage, idx) => {
        const y = idx * (stageHeight + gap) + 10;
        
        // Funnel trapezoid width calculations
        const widthTop = 260 * (idx === 0 ? 1 : stages[idx-1].count / maxVal);
        const widthBottom = 260 * (stage.count / maxVal);
        
        // Normalized center bounds
        const xTopLeft = 150 - widthTop / 2;
        const xTopRight = 150 + widthTop / 2;
        const xBottomLeft = 150 - widthBottom / 2;
        const xBottomRight = 150 + widthBottom / 2;
        
        const yBottom = y + stageHeight;
        
        // Define trapezoid path
        const path = `M ${xTopLeft} ${y} L ${xTopRight} ${y} L ${xBottomRight} ${yBottom} L ${xBottomLeft} ${yBottom} Z`;
        
        svgHtml += `
            <path class="svg-chart-path" d="${path}" fill="${stage.color}" opacity="0.12" stroke="${stage.color}" stroke-width="1.5" style="animation-delay: ${idx * 0.1}s;"></path>
            <path class="svg-chart-fill" d="${path}" fill="${stage.color}" style="animation-delay: ${idx * 0.1 + 0.3}s;"></path>
            <text x="150" y="${y + 17}" text-anchor="middle" fill="var(--text)" font-family="var(--font-data)" font-size="10" font-weight="700" style="pointer-events: none;">
                ${stage.label}: ${stage.count} leads
            </text>
        `;
    });
    
    svgHtml += `</svg>`;
    container.innerHTML = svgHtml;
}

function drawNicheDonutChart(leads) {
    const container = document.getElementById('donut-chart-container');
    if (!container) return;
    
    // Aggregate niches counts
    const nicheCounts = {};
    leads.forEach(lead => {
        const niche = lead.niche || 'Other';
        nicheCounts[niche] = (nicheCounts[niche] || 0) + 1;
    });
    
    // Sort and take top 4 niches, aggregate others
    const sorted = Object.entries(nicheCounts).sort((a, b) => b[1] - a[1]);
    const topNiches = sorted.slice(0, 3);
    
    let otherCount = 0;
    if (sorted.length > 3) {
        sorted.slice(3).forEach(entry => { otherCount += entry[1]; });
    }
    
    if (otherCount > 0) {
        topNiches.push(['Other', otherCount]);
    }
    
    const total = leads.length || 1;
    
    const colors = ['var(--accent)', 'var(--thinking)', 'var(--success)', 'var(--warning)'];
    
    let svgHtml = `<svg width="100%" height="100%" viewBox="0 0 260 180" style="overflow: visible;">`;
    
    // Draw donut ring segments
    const cx = 90;
    const cy = 90;
    const r = 50;
    const strokeWidth = 14;
    const circ = 2 * Math.PI * r;
    
    let currentAngle = -90; // start at top
    let accumPercent = 0;
    
    topNiches.forEach((niche, idx) => {
        const percent = niche[1] / total;
        const strokeDashArray = `${percent * circ} ${circ}`;
        const strokeDashOffset = -accumPercent * circ;
        const color = colors[idx % colors.length];
        
        svgHtml += `
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${strokeWidth}"
                    stroke-dasharray="${strokeDashArray}" stroke-dashoffset="${strokeDashOffset}"
                    opacity="0.2" transform="rotate(-90 ${cx} ${cy})"></circle>
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${strokeWidth}"
                    stroke-dasharray="${strokeDashArray}" stroke-dashoffset="${strokeDashOffset}"
                    transform="rotate(-90 ${cx} ${cy})" style="stroke-dasharray: ${percent * circ}; stroke-dashoffset: ${strokeDashOffset}; animation: draw-chart-stroke 2s forwards ease-in-out;"></circle>
        `;
        
        // Draw Legend item
        const legY = idx * 30 + 35;
        const textPercent = Math.round(percent * 100);
        svgHtml += `
            <rect x="160" y="${legY}" width="10" height="10" rx="3" fill="${color}"></rect>
            <text x="176" y="${legY + 9}" fill="var(--text)" font-family="var(--font-headings)" font-size="11" font-weight="600">
                ${niche[0].capitalize()}
            </text>
            <text x="176" y="${legY + 20}" fill="var(--text-muted)" font-family="var(--font-data)" font-size="9">
                ${niche[1]} leads (${textPercent}%)
            </text>
        `;
        
        accumPercent += percent;
    });
    
    // Middle count label
    svgHtml += `
        <text x="${cx}" y="${cy + 4}" text-anchor="middle" fill="var(--text)" font-family="var(--font-headings)" font-size="13" font-weight="800">
            ${leads.length}
        </text>
        <text x="${cx}" y="${cy + 15}" text-anchor="middle" fill="var(--text-muted)" font-family="var(--font-data)" font-size="8" text-transform="uppercase">
            Total
        </text>
    `;
    
    svgHtml += `</svg>`;
    container.innerHTML = svgHtml;
}

function drawFitScoreBarChart(stats) {
    const container = document.getElementById('bar-chart-container');
    if (!container) return;
    
    const categories = [
        { label: 'Hot (8-10)', count: stats.hot || 0, color: 'var(--danger)' },
        { label: 'Warm (5-7)', count: stats.warm || 0, color: 'var(--warning)' },
        { label: 'Cold (1-4)', count: stats.cold || 0, color: 'var(--accent)' }
    ];
    
    const maxVal = Math.max(...categories.map(c => c.count), 1);
    
    let svgHtml = `<svg width="100%" height="100%" viewBox="0 0 280 180" style="overflow: visible;">`;
    
    categories.forEach((cat, idx) => {
        const y = idx * 45 + 30;
        const width = 160 * (cat.count / maxVal);
        
        svgHtml += `
            <!-- Y label -->
            <text x="10" y="${y + 12}" fill="var(--text-muted)" font-family="var(--font-headings)" font-size="11" font-weight="600">
                ${cat.label}
            </text>
            
            <!-- Background bar -->
            <rect x="90" y="${y}" width="160" height="18" rx="6" fill="rgba(255,255,255,0.02)" stroke="var(--border)" stroke-width="1"></rect>
            
            <!-- Animated bar fill -->
            <rect x="90" y="${y}" width="${width}" height="18" rx="6" fill="${cat.color}" opacity="0.8" style="width: 0px; animation: draw-bar-width 1.5s forwards cubic-bezier(0.16, 1, 0.3, 1); animation-delay: ${idx * 0.15}s;"></rect>
            
            <!-- Quantity count label -->
            <text x="${95 + width}" y="${y + 13}" fill="var(--text)" font-family="var(--font-data)" font-size="10" font-weight="700">
                ${cat.count}
            </text>
        `;
    });
    
    // Add dynamic keyframes inside style block to anim bar width
    svgHtml += `
        <style>
            @keyframes draw-bar-width {
                to {
                    width: var(--target-width);
                }
            }
        </style>
    `;
    
    svgHtml += `</svg>`;
    
    // Create elements and inject target widths as custom CSS variables
    container.innerHTML = svgHtml;
    
    // Inject the target widths for the animated bars dynamically
    const bars = container.querySelectorAll('rect[opacity="0.8"]');
    categories.forEach((cat, idx) => {
        const width = 160 * (cat.count / maxVal);
        if (bars[idx]) {
            bars[idx].style.setProperty('--target-width', `${width}px`);
        }
    });
}
