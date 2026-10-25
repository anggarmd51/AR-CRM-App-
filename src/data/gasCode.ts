/**
 * AR Personal CRM Enterprise - Google Apps Script Backend (Code.gs v2.2.0)
 * 
 * Features:
 * - High-speed action router for CRM operations (getLeads, addLead, updateLeadStage, addActivity, importGlobalLead)
 * - Automatic Won Deals Archiving to separate 'Archive_Logs' sheet on Closing Won
 * - CORS-compliant JSON outputs
 */

export const GAS_BACKEND_CODE = `/**
 * AR Personal CRM Enterprise - Google Apps Script Backend (Code.gs v2.2.0)
 * Spreadsheet: "Personal CRM Data"
 * Sheets: Leads, Activities, Global_Leads, Archive_Logs
 */

const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getOrCreateSheet(sheetName, headers) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    if (headers && headers.length > 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#1A2E40").setFontColor("#FFFFFF");
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    const action = e.parameter.action || "getLeads";
    const ss = getSpreadsheet();

    if (action === "getLeads") {
      const sheet = getOrCreateSheet("Leads", [
        "id", "company_name", "contact_person", "phone", "industry", "city",
        "pipeline_stage", "deal_value", "next_followup_date", "lead_score", "created_at", "updated_at"
      ]);
      const rows = sheet.getDataRange().getValues();
      if (rows.length <= 1) return createJsonResponse([]);
      const headers = rows[0];
      const leads = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row[0]) continue;
        const obj = {};
        headers.forEach((h, idx) => {
          obj[h] = row[idx];
        });
        leads.push(obj);
      }
      return createJsonResponse(leads);
    }

    if (action === "getActivities") {
      const sheet = getOrCreateSheet("Activities", [
        "id", "lead_id", "activity_type", "notes", "ai_summary", "location_gps", "created_at"
      ]);
      const rows = sheet.getDataRange().getValues();
      if (rows.length <= 1) return createJsonResponse([]);
      const headers = rows[0];
      const activities = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row[0]) continue;
        const obj = {};
        headers.forEach((h, idx) => {
          obj[h] = row[idx];
        });
        activities.push(obj);
      }
      return createJsonResponse(activities);
    }

    if (action === "getGlobalLeads") {
      const sheet = getOrCreateSheet("Global_Leads", [
        "id", "company_name", "contact_person", "phone", "industry", "city", "estimated_value", "tags"
      ]);
      const rows = sheet.getDataRange().getValues();
      if (rows.length <= 1) return createJsonResponse([]);
      const headers = rows[0];
      const items = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row[0]) continue;
        const obj = {};
        headers.forEach((h, idx) => {
          obj[h] = row[idx];
        });
        items.push(obj);
      }
      return createJsonResponse(items);
    }

    if (action === "getArchiveLogs") {
      const sheet = getOrCreateSheet("Archive_Logs", [
        "id", "lead_id", "company_name", "contact_person", "phone", "deal_value", "industry", "city", "won_date", "archived_at"
      ]);
      const rows = sheet.getDataRange().getValues();
      if (rows.length <= 1) return createJsonResponse([]);
      const headers = rows[0];
      const archives = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row[0]) continue;
        const obj = {};
        headers.forEach((h, idx) => {
          obj[h] = row[idx];
        });
        archives.push(obj);
      }
      return createJsonResponse(archives);
    }

    return createJsonResponse({ error: "Unknown action: " + action });
  } catch (error) {
    return createJsonResponse({ error: error.message || String(error) });
  }
}

function doPost(e) {
  try {
    let body = {};
    if (e.postData && e.postData.contents) {
      try {
        body = JSON.parse(e.postData.contents);
      } catch (err) {
        body = e.parameter || {};
      }
    } else {
      body = e.parameter || {};
    }

    const action = body.action || "addLead";

    if (action === "addLead") {
      const sheet = getOrCreateSheet("Leads", [
        "id", "company_name", "contact_person", "phone", "industry", "city",
        "pipeline_stage", "deal_value", "next_followup_date", "lead_score", "created_at", "updated_at"
      ]);
      const newId = "LEAD-" + Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd-HHmmss");
      const now = new Date().toISOString();
      sheet.appendRow([
        newId,
        body.company_name || "",
        body.contact_person || "",
        body.phone || "",
        body.industry || "",
        body.city || "",
        body.pipeline_stage || "Prospect",
        Number(body.deal_value) || 0,
        body.next_followup_date || "",
        body.lead_score || "Warm",
        now,
        now
      ]);
      return createJsonResponse({ status: "success", id: newId, message: "Lead added" });
    }

    if (action === "updateLeadStage") {
      const sheet = getOrCreateSheet("Leads");
      const id = body.id;
      const newStage = body.pipeline_stage;
      const followupDate = body.next_followup_date || "";
      const rows = sheet.getDataRange().getValues();

      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]) === String(id)) {
          // Columns: 7 = pipeline_stage, 9 = next_followup_date, 12 = updated_at
          sheet.getRange(i + 1, 7).setValue(newStage);
          if (followupDate) {
            sheet.getRange(i + 1, 9).setValue(followupDate);
          }
          sheet.getRange(i + 1, 12).setValue(new Date().toISOString());
          return createJsonResponse({ status: "success", id: id, message: "Stage updated to " + newStage });
        }
      }
      return createJsonResponse({ status: "error", message: "Lead ID not found: " + id });
    }

    if (action === "addActivity") {
      const sheet = getOrCreateSheet("Activities", [
        "id", "lead_id", "activity_type", "notes", "ai_summary", "location_gps", "created_at"
      ]);
      const actId = "ACT-" + Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd-HHmmss");
      sheet.appendRow([
        actId,
        body.lead_id || "",
        body.activity_type || "Meeting Check-In",
        body.notes || "",
        body.ai_summary || "",
        body.location_gps || "",
        new Date().toISOString()
      ]);
      return createJsonResponse({ status: "success", id: actId, message: "Activity recorded" });
    }

    if (action === "archiveClosingWon") {
      const sheet = getOrCreateSheet("Archive_Logs", [
        "id", "lead_id", "company_name", "contact_person", "phone", "deal_value", "industry", "city", "won_date", "archived_at"
      ]);
      const archiveId = "ARCHIVE-" + Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd-HHmmss");
      sheet.appendRow([
        archiveId,
        body.lead_id || "",
        body.company_name || "",
        body.contact_person || "",
        body.phone || "",
        Number(body.deal_value) || 0,
        body.industry || "",
        body.city || "",
        body.won_date || Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd"),
        new Date().toISOString()
      ]);
      return createJsonResponse({ status: "success", id: archiveId, message: "Deal archived in Archive_Logs sheet" });
    }

    if (action === "importGlobalLead") {
      const sheet = getOrCreateSheet("Leads");
      const newId = "LEAD-IMP-" + Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd-HHmmss");
      const now = new Date().toISOString();
      sheet.appendRow([
        newId,
        body.company_name || "",
        body.contact_person || "",
        body.phone || "",
        body.industry || "",
        body.city || "",
        body.pipeline_stage || "Prospect",
        Number(body.deal_value) || 50000000,
        body.next_followup_date || "",
        body.lead_score || "Hot",
        now,
        now
      ]);
      return createJsonResponse({ status: "success", id: newId, message: "Global lead imported" });
    }

    return createJsonResponse({ error: "Unknown POST action: " + action });
  } catch (error) {
    return createJsonResponse({ error: error.message || String(error) });
  }
}
`;
